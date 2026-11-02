package controllers

import (
	"context"
	"encoding/json"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/Maheshkarri4444/wtexamify/config.go"
	"github.com/Maheshkarri4444/wtexamify/models"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

var userCollection *mongo.Collection = config.Collection("users")
var studentContainerCollection *mongo.Collection = config.Collection("student_containers")
var teacherContainerCollection *mongo.Collection = config.Collection("teacher_containers")

// Allowed teacher/admin emails whitelist. More can be added with TEACHER_EMAILS in .env.
var allowedTeacherEmails = []string{
	"maheshkarri2109@gmail.com",
	"maheshkarri2222@gmail.com",
	"vasuch9959@rguktn.ac.in",
	"vasu.challapalli9@gmail.com",
	"yasvanthhanumantu1@gmail.com",
	"vasuch9491@gmail.com",
	"ramavathmallikarjunanaik332@gmail.com",
	// Add more teacher/admin emails here
}

func isTeacherEmail(email string) bool {
	for _, allowedEmail := range append(allowedTeacherEmails, config.List("TEACHER_EMAILS")...) {
		if strings.EqualFold(email, allowedEmail) {
			return true
		}
	}
	return false
}

// isStudentEmail accepts RGUKT addresses, plus any TEST_STUDENT_EMAILS used to try the student side.
func isStudentEmail(email string) bool {
	if strings.HasSuffix(email, "@rguktn.ac.in") {
		return true
	}
	for _, testEmail := range config.List("TEST_STUDENT_EMAILS") {
		if strings.EqualFold(email, testEmail) {
			return true
		}
	}
	return false
}

func googleOauthConfig() *oauth2.Config {
	return &oauth2.Config{
		ClientID:     config.Get("GOOGLE_CLIENT_ID", ""),
		ClientSecret: config.Get("GOOGLE_CLIENT_SECRET", ""),
		RedirectURL:  config.Get("GOOGLE_REDIRECT_URL", "https://vastlabs.netlify.app/google/callback"),
		Scopes:       []string{"email", "profile"},
		Endpoint:     google.Endpoint,
	}
}

func generateJWT(email string) (string, error) {
	claims := jwt.MapClaims{
		"email": email,
		"exp":   time.Now().Add(time.Hour * 24).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(config.JWTSecret())
}

func GoogleLogin(c *gin.Context) {
	// The frontend passes a random state and checks it when Google sends the user back.
	state := c.Query("state")
	if len(state) < 8 || len(state) > 128 {
		state = "state-token"
	}
	c.Redirect(http.StatusFound, googleOauthConfig().AuthCodeURL(state))
}

func GoogleCallback(c *gin.Context) {
	code := c.Query("code")
	if code == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing authorization code"})
		return
	}

	oauthConfig := googleOauthConfig()
	token, err := oauthConfig.Exchange(c.Request.Context(), code)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to exchange code", "details": err.Error()})
		return
	}

	userInfoResp, err := oauthConfig.Client(c.Request.Context(), token).Get("https://www.googleapis.com/oauth2/v2/userinfo")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch user info", "details": err.Error()})
		return
	}
	defer userInfoResp.Body.Close()

	var userInfo map[string]interface{}
	if err := json.NewDecoder(userInfoResp.Body).Decode(&userInfo); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode user info", "details": err.Error()})
		return
	}

	email, ok := userInfo["email"].(string)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Email not found in user info"})
		return
	}
	email = strings.ToLower(email)
	name, _ := userInfo["name"].(string)
	googleID, _ := userInfo["id"].(string)
	image, _ := userInfo["picture"].(string)

	var role string
	switch {
	case isTeacherEmail(email):
		role = "teacher"
	case isStudentEmail(email):
		role = "student"
	default:
		c.JSON(http.StatusForbidden, gin.H{"error": "Access denied. Your email is not authorized."})
		return
	}

	user, err := findOrCreateUser(c.Request.Context(), email, name, googleID, image, role)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save user", "details": err.Error()})
		return
	}
	respondWithToken(c, user)
}

// DevLogin signs in as any email and role without Google. It only exists when
// APP_ENV=development and only answers requests coming from this machine.
func DevLogin(c *gin.Context) {
	if !config.IsDevelopment() || !isLoopback(c.Request.RemoteAddr) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Not found"})
		return
	}

	var request struct {
		Email string `json:"email"`
		Name  string `json:"name"`
		Role  string `json:"role"`
	}
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}
	email := strings.ToLower(strings.TrimSpace(request.Email))
	if !strings.Contains(email, "@") || (request.Role != "teacher" && request.Role != "student") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Send an email and a role of teacher or student"})
		return
	}
	name := strings.TrimSpace(request.Name)
	if name == "" {
		name = strings.Split(email, "@")[0]
	}

	user, err := findOrCreateUser(c.Request.Context(), email, name, "", "", request.Role)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save user", "details": err.Error()})
		return
	}
	respondWithToken(c, user)
}

func isLoopback(remoteAddr string) bool {
	host, _, err := net.SplitHostPort(remoteAddr)
	if err != nil {
		return false
	}
	ip := net.ParseIP(host)
	return ip != nil && ip.IsLoopback()
}

// findOrCreateUser returns the stored user, creating it on first login. If the
// whitelist changed since their last login, the stored role is updated to match.
func findOrCreateUser(ctx context.Context, email, name, googleID, image, role string) (models.User, error) {
	var user models.User
	err := userCollection.FindOne(ctx, bson.M{"email": email}).Decode(&user)
	if err == nil {
		if user.Role != role {
			user.Role = role
			user.UpdatedAt = primitive.NewDateTimeFromTime(time.Now())
			_, err = userCollection.UpdateOne(ctx, bson.M{"_id": user.ID}, bson.M{"$set": bson.M{"role": role, "updated_at": user.UpdatedAt}})
		}
		return user, err
	}
	if err != mongo.ErrNoDocuments {
		return user, err
	}

	containerID := primitive.NewObjectID()
	if role == "student" {
		studentContainer := models.StudentContainer{
			ID: containerID,
			QuestionPapers: []struct {
				ExamID        primitive.ObjectID `bson:"exam_id" json:"exam_id"`
				AnswerSheetID primitive.ObjectID `bson:"answer_sheet_id" json:"answer_sheet_id"`
				Copied        bool               `bson:"copied" json:"copied"`
			}{},
		}
		if _, err := studentContainerCollection.InsertOne(ctx, studentContainer); err != nil {
			return user, err
		}
	} else {
		teacherContainer := models.TeacherContainer{
			ID: containerID,
			Exams: []struct {
				ExamID primitive.ObjectID `bson:"exam_id" json:"exam_id"`
			}{},
		}
		if _, err := teacherContainerCollection.InsertOne(ctx, teacherContainer); err != nil {
			return user, err
		}
	}

	user = models.User{
		ID:          primitive.NewObjectID(),
		Name:        name,
		Email:       email,
		GoogleID:    googleID,
		Image:       image,
		Role:        role,
		ContainerID: containerID,
		CreatedAt:   primitive.NewDateTimeFromTime(time.Now()),
		UpdatedAt:   primitive.NewDateTimeFromTime(time.Now()),
	}
	_, err = userCollection.InsertOne(ctx, user)
	return user, err
}

func respondWithToken(c *gin.Context, user models.User) {
	jwtToken, err := generateJWT(user.Email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate JWT", "details": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"token": jwtToken, "user": user})
}
