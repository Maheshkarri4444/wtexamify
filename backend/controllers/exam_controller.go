package controllers

import (
	"context"
	"fmt"
	"math/rand"
	"net/http"
	"strings"
	"time"

	"github.com/Maheshkarri4444/wtexamify/config.go"
	"github.com/Maheshkarri4444/wtexamify/models"
	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"gopkg.in/gomail.v2"
)

var examCollection *mongo.Collection = config.GetCollection(config.Client, "exams")
var questionSetCollection *mongo.Collection = config.GetCollection(config.Client, "questionsets")

func generateQuestionSets(questions []string, examType string) [][]string {
	var setSize int
	if examType == "viva" {
		setSize = 10
	} else {
		setSize = 3
	}

	if len(questions) < setSize {
		return nil // Not enough questions to form a single set
	}

	rand.Shuffle(len(questions), func(i, j int) { questions[i], questions[j] = questions[j], questions[i] })
	var result [][]string

	for i := 0; i+setSize <= len(questions); i += setSize {
		result = append(result, questions[i:i+setSize])
	}

	return result
}

func CreateExam(c *gin.Context) {
	var exam models.Exam

	if err := c.ShouldBindJSON(&exam); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	containerID, exists := c.Get("container_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized user"})
		return
	}
	containerObjID, _ := containerID.(primitive.ObjectID)

	exam.ID = primitive.NewObjectID()
	exam.Status = "stop"
	exam.ExamType = strings.ToLower(exam.ExamType)
	if exam.ExamType != "internal" && exam.ExamType != "external" && exam.ExamType != "viva" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid exam type"})
		return
	}

	exam.AnswerSheets = []primitive.ObjectID{}
	exam.CreatedAt = primitive.NewDateTimeFromTime(time.Now())
	exam.UpdatedAt = primitive.NewDateTimeFromTime(time.Now())

	// Generate question sets
	questionSets := generateQuestionSets(exam.Questions, exam.ExamType)
	var setIDs []primitive.ObjectID

	for i, questions := range questionSets {
		questionSet := models.QuestionSet{
			ID:        primitive.NewObjectID(),
			ExamID:    exam.ID,
			ExamType:  exam.ExamType,
			SetNumber: i + 1,
			Questions: questions,
			CreatedAt: primitive.NewDateTimeFromTime(time.Now()),
		}
		_, err := questionSetCollection.InsertOne(context.TODO(), questionSet)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create question set"})
			return
		}
		setIDs = append(setIDs, questionSet.ID)
	}

	exam.Sets = setIDs
	_, err := examCollection.InsertOne(context.TODO(), exam)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create exam"})
		return
	}

	update := bson.M{"$push": bson.M{"exams": bson.M{"exam_id": exam.ID}}}
	_, err = teacherContainerCollection.UpdateOne(context.TODO(), bson.M{"_id": containerObjID}, update)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update teacher container"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "Exam created successfully", "exam": exam})
}

func UpdateExam(c *gin.Context) {
	examID := c.Param("id")
	objID, err := primitive.ObjectIDFromHex(examID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid exam ID"})
		return
	}

	var updateData struct {
		Name      string   `json:"name,omitempty"`
		Duration  int      `json:"duration,omitempty"`
		Questions []string `json:"questions,omitempty"`
		Status    string   `json:"status,omitempty" validate:"oneof=start stop"`
		ExamType  string   `json:"exam_type,omitempty"`
	}

	if err := c.ShouldBindJSON(&updateData); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	updateFields := bson.M{"updated_at": primitive.NewDateTimeFromTime(time.Now())}

	if updateData.Name != "" {
		updateFields["name"] = updateData.Name
	}
	if updateData.Duration > 0 {
		updateFields["duration"] = updateData.Duration
	}
	if updateData.Status == "start" || updateData.Status == "stop" {
		updateFields["status"] = updateData.Status
	}
	if updateData.ExamType != "" {
		examType := strings.ToLower(updateData.ExamType)
		if examType != "internal" && examType != "external" && examType != "viva" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid exam type"})
			return
		}
		updateFields["exam_type"] = examType
	}

	if len(updateData.Questions) > 0 {
		// Fetch current exam to get existing sets
		var existingExam models.Exam
		err := examCollection.FindOne(context.TODO(), bson.M{"_id": objID}).Decode(&existingExam)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch existing exam"})
			return
		}

		// Delete only the records in the exam.sets, not the question sets collection
		_, err = questionSetCollection.DeleteMany(context.TODO(), bson.M{"_id": bson.M{"$in": existingExam.Sets}})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to remove existing question sets from exam"})
			return
		}

		// Generate new question sets
		questionSets := generateQuestionSets(updateData.Questions, updateData.ExamType)
		var setIDs []primitive.ObjectID
		for i, questions := range questionSets {
			questionSet := models.QuestionSet{
				ID:        primitive.NewObjectID(),
				ExamID:    objID,
				ExamType:  updateData.ExamType,
				SetNumber: i + 1,
				Questions: questions,
				CreatedAt: primitive.NewDateTimeFromTime(time.Now()),
			}
			_, err := questionSetCollection.InsertOne(context.TODO(), questionSet)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create question set"})
				return
			}
			setIDs = append(setIDs, questionSet.ID)
		}

		updateFields["sets"] = setIDs
	}

	_, err = examCollection.UpdateOne(context.TODO(), bson.M{"_id": objID}, bson.M{"$set": updateFields})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update exam"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Exam updated successfully, question sets regenerated if needed"})
}

func GetAllStartedExams(c *gin.Context) {
	var exams []models.Exam

	cursor, err := examCollection.Find(context.TODO(), bson.M{"status": "start"})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch exams"})
		return
	}
	defer cursor.Close(context.TODO())

	if err = cursor.All(context.TODO(), &exams); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode exams"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"exams": exams})
}

func GetExamsByTeacherContainerID(c *gin.Context) {
	// fmt.Println("called")
	containerID := c.Param("id")
	containerObjID, err := primitive.ObjectIDFromHex(containerID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid container ID"})
		return
	}

	var teacherContainer models.TeacherContainer
	err = teacherContainerCollection.FindOne(context.TODO(), bson.M{"_id": containerObjID}).Decode(&teacherContainer)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Teacher container not found"})
		return
	}

	var exams []models.Exam
	examIDs := []primitive.ObjectID{}
	for _, exam := range teacherContainer.Exams {
		examIDs = append(examIDs, exam.ExamID)
	}

	cursor, err := examCollection.Find(context.TODO(), bson.M{"_id": bson.M{"$in": examIDs}})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch exams"})
		return
	}
	defer cursor.Close(context.TODO())

	if err = cursor.All(context.TODO(), &exams); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode exams"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"exams": exams})
}

func GetExam(c *gin.Context) {
	examID := c.Param("id")
	objID, err := primitive.ObjectIDFromHex(examID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid exam ID"})
		return
	}

	var exam models.Exam
	err = examCollection.FindOne(context.TODO(), bson.M{"_id": objID}).Decode(&exam)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			c.JSON(http.StatusNotFound, gin.H{"error": "Exam not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch exam"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"exam": exam})
}

func GetSetsByExamID(c *gin.Context) {
	examID, err := primitive.ObjectIDFromHex(c.Param("examID"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid exam ID"})
		return
	}

	var sets []models.QuestionSet
	cursor, err := questionSetCollection.Find(context.TODO(), bson.M{"exam_id": examID})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch question sets"})
		return
	}
	defer cursor.Close(context.TODO())

	if err = cursor.All(context.TODO(), &sets); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode question sets"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"question_sets": sets})
}

func SendEmails(c *gin.Context) {
	// List of recipient emails
	emails := []string{"maheshkarri2109@gmail.com", "n210507@rguktn.ac.in"}

	// Email Configuration
	smtpHost := "smtp.gmail.com" // Use your email provider's SMTP
	smtpPort := 587
	senderEmail := "maheshkarri2222@gmail.com" // Replace with your email
	senderPassword := "izlw dibg dojb xpxa"    // Replace with your app password

	// Email Subject & Body
	subject := "Lab Exam Invitation"
	link := "https://wtlabexam.vercel.app"
	bodyTemplate := `
		<html>
			<body style="font-family: Arial, sans-serif; text-align: center;">
				<h2>You are invited to write the Lab Exam</h2>
				<p>Please click the button below to proceed:</p>
				<a href="%s" style="display: inline-block; padding: 10px 20px; font-size: 16px; 
					color: #fff; background-color: #007bff; text-decoration: none; border-radius: 5px;">
					Join Exam
				</a>
			</body>
		</html>
	`

	// SMTP Dialer
	dialer := gomail.NewDialer(smtpHost, smtpPort, senderEmail, senderPassword)

	// Loop through each email and send the message
	for _, email := range emails {
		message := gomail.NewMessage()
		message.SetHeader("From", senderEmail)
		message.SetHeader("To", email)
		message.SetHeader("Subject", subject)
		message.SetBody("text/html", fmt.Sprintf(bodyTemplate, link))

		// Send Email
		if err := dialer.DialAndSend(message); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Failed to send email to %s", email)})
			return
		}
	}

	// Success response
	c.JSON(http.StatusOK, gin.H{"message": "Emails sent successfully"})
}
