package controllers

import (
	"context"
	"math/rand"
	"net/http"
	"time"

	"github.com/Maheshkarri4444/wtexamify/config.go"
	"github.com/Maheshkarri4444/wtexamify/models"
	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
)

var answerSheetCollection *mongo.Collection = config.GetCollection(config.Client, "answersheets")

func CreateAnswerSheet(c *gin.Context) {
	// Get student details from middleware
	studentName, _ := c.Get("name")
	studentEmail, _ := c.Get("email")
	containerID, _ := c.Get("container_id") // Student's container ID

	// Get exam ID from request body
	var request struct {
		ExamID string `json:"exam_id"`
	}
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request data"})
		return
	}

	examID, err := primitive.ObjectIDFromHex(request.ExamID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid exam ID"})
		return
	}

	// Fetch the exam data
	var exam models.Exam
	err = examCollection.FindOne(context.TODO(), bson.M{"_id": examID}).Decode(&exam)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Exam not found"})
		return
	}

	// Select 3 random questions
	if len(exam.Questions) < 3 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Not enough questions in the exam"})
		return
	}

	rand.Seed(time.Now().UnixNano())
	rand.Shuffle(len(exam.Questions), func(i, j int) { exam.Questions[i], exam.Questions[j] = exam.Questions[j], exam.Questions[i] })

	selectedQuestions := exam.Questions[:3]
	data := make(map[string]string)
	for _, q := range selectedQuestions {
		data[q] = ""
	}

	// Create answer sheet
	answerSheetID := primitive.NewObjectID()
	answerSheet := models.AnswerSheet{
		ID:           answerSheetID,
		ExamID:       examID,
		StudentName:  studentName.(string),
		StudentEmail: studentEmail.(string),
		Data:         data,
		Copied:       false,
		SubmitStatus: false,
		CreatedAt:    primitive.NewDateTimeFromTime(time.Now()),
	}

	_, err = answerSheetCollection.InsertOne(context.TODO(), answerSheet)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create answer sheet"})
		return
	}

	// Update Student Container with examId and answerSheetId
	studentContainerID, ok := containerID.(primitive.ObjectID)
	if ok {
		update := bson.M{
			"$push": bson.M{
				"question_papers": bson.M{
					"exam_id":         examID,
					"answer_sheet_id": answerSheetID,
					"copied":          false,
				},
			},
		}

		_, err = studentContainerCollection.UpdateOne(context.TODO(), bson.M{"_id": studentContainerID}, update)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update student container"})
			return
		}
	}

	// Update Exam data to include answerSheetId in answer_sheets
	_, err = examCollection.UpdateOne(context.TODO(), bson.M{"_id": examID}, bson.M{
		"$push": bson.M{"answer_sheets": answerSheetID},
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update exam with answer sheet ID"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":      "Answer sheet created successfully",
		"answerSheet":  answerSheet,
		"container_id": containerID,
	})
}

func SubmitAnswerSheet(c *gin.Context) {
	// Get student details from middleware
	studentEmail, _ := c.Get("email")

	// Get answer sheet ID and submitted answers from request body
	var request struct {
		AnswerSheetID string            `json:"answer_sheet_id"`
		Answers       map[string]string `json:"answers"`
		AIScore       *float64          `json:"ai_score,omitempty"` // Optional
	}
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request data"})
		return
	}

	answerSheetID, err := primitive.ObjectIDFromHex(request.AnswerSheetID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid answer sheet ID"})
		return
	}

	// Fetch the answer sheet
	var answerSheet models.AnswerSheet
	err = answerSheetCollection.FindOne(context.TODO(), bson.M{"_id": answerSheetID, "student_email": studentEmail}).Decode(&answerSheet)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Answer sheet not found"})
		return
	}

	// Ensure the answer sheet has not already been submitted
	if answerSheet.SubmitStatus {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Answer sheet already submitted"})
		return
	}

	// Update the answer sheet with submitted answers and AI score
	update := bson.M{
		"$set": bson.M{
			"data":          request.Answers,
			"submit_status": true,
		},
	}

	// If AI score is provided, update it
	if request.AIScore != nil {
		update["$set"].(bson.M)["ai_score"] = *request.AIScore
	}

	_, err = answerSheetCollection.UpdateOne(context.TODO(), bson.M{"_id": answerSheetID}, update)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to submit answer sheet"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Answer sheet submitted successfully",
	})
}
