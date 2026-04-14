package controllers

import (
	"context"
	"encoding/json"
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

var userCollection *mongo.Collection = config.GetCollection(config.Client, "users")
var studentContainerCollection *mongo.Collection = config.GetCollection(config.Client, "student_containers")
var teacherContainerCollection *mongo.Collection = config.GetCollection(config.Client, "teacher_containers")

// Allowed teacher/admin emails whitelist
var allowedTeacherEmails = []string{
	"maheshkarri2109@gmail.com",
	"maheshkarri2222@gmail.com",
	// "vasuch9959@rguktn.ac.in",
	"vasu.challapalli9@gmail.com",
	"yasvanthhanumantu1@gmail.com",
	"vasuch9491@gmail.com",
	"ramavathmallikarjunanaik332@gmail.com",
	// Add more teacher/admin emails here
}

func isEmailAllowed(email string) bool {
	for _, allowedEmail := range allowedTeacherEmails {
		if email == allowedEmail {
			return true
		}
	}

	return strings.HasSuffix(email, "@rguktn.ac.in")
}

var googleOauthConfig = &oauth2.Config{
	ClientID:     "117664400321-kchnk20sjd2m9h46u0e1go3194d19uut.apps.googleusercontent.com",
	ClientSecret: "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",
	// RedirectURL:  "https://labexamsrgukt.vercel.app/google/callback",
	RedirectURL: "https://vastlabs.netlify.app/google/callback",
	// RedirectURL: "http://localhost:5173/google/callback",
	Scopes:   []string{"email", "profile"},
	Endpoint: google.Endpoint,
}

func generateJWT(email string) (string, error) {
	claims := jwt.MapClaims{
		"email": email,
		"exp":   time.Now().Add(time.Hour * 24).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte("maheshkarri2109"))
}

func GoogleLogin(c *gin.Context) {
	url := googleOauthConfig.AuthCodeURL("state-token", oauth2.AccessTypeOffline)
	c.Redirect(http.StatusFound, url)
}

func GoogleCallback(c *gin.Context) {
	code := c.Query("code")
	if code == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Missing authorization code"})
		return
	}

	token, err := googleOauthConfig.Exchange(context.TODO(), code)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to exchange code", "details": err.Error()})
		return
	}

	userInfoResp, err := http.Get("https://www.googleapis.com/oauth2/v2/userinfo?access_token=" + token.AccessToken)
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
	name, _ := userInfo["name"].(string)
	googleID, _ := userInfo["id"].(string)
	image, _ := userInfo["picture"].(string)

	// // Check if email is in teacher/admin whitelist
	// isTeacher := false
	// for _, allowedEmail := range allowedTeacherEmails {
	// 	if email == allowedEmail {
	// 		isTeacher = true
	// 		break
	// 	}
	// }

	// // If not a teacher, check if it's a valid RGUKT student email
	// if !isTeacher {
	// 	if !strings.HasSuffix(email, "@rguktn.ac.in") {
	// 		// Not a teacher and not an RGUKT email - deny access
	// 		c.JSON(http.StatusForbidden, gin.H{"error": "Access denied. Your email is not authorized to use this system."})
	// 		return
	// 	}
	// 	// RGUKT email - allowed (frontend validates domain only)
	// }

	// // Determine role
	// role := "student"
	// if isTeacher {
	// 	role = "teacher"
	// } else if strings.HasSuffix(email, "@rguktn.ac.in") {
	// 	role = "student"
	// }

	// Check if email is in teacher/admin whitelist
	isAllowedTeacher := false
	for _, allowedEmail := range allowedTeacherEmails {
		if email == allowedEmail {
			isAllowedTeacher = true
			break
		}
	}

	// Determine role
	role := "student"
	if isAllowedTeacher {
		role = "teacher"
	} else if strings.HasSuffix(email, "@rguktn.ac.in") {
		role = "student"
	} else {
		// Not a teacher and not a student-domain email
		// For now we assume they are a blocked user or we assign a default role
		// But based on the user's flow, we allow the login but check in frontend
		// Actually, let's be strict:
		c.JSON(http.StatusForbidden, gin.H{"error": "Access denied. Your email is not authorized."})
		return
	}

	var user models.User
	err = userCollection.FindOne(context.TODO(), bson.M{"email": email}).Decode(&user)

	if err == mongo.ErrNoDocuments {
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
			studentContainerCollection.InsertOne(context.TODO(), studentContainer)
		} else {
			teacherContainer := models.TeacherContainer{
				ID: containerID,
				Exams: []struct {
					ExamID primitive.ObjectID `bson:"exam_id" json:"exam_id"`
				}{},
			}
			teacherContainerCollection.InsertOne(context.TODO(), teacherContainer)
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
		_, err := userCollection.InsertOne(context.TODO(), user)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create user", "details": err.Error()})
			return
		}
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error", "details": err.Error()})
		return
	}

	jwtToken, err := generateJWT(email)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to generate JWT", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"token": jwtToken, "user": user})
}
