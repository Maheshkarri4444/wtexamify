package controllers

import (
	"context"
	"encoding/json"
	"math/rand"
	"net/http"
	"time"

	"github.com/Maheshkarri4444/wtexamify/config.go"
	"github.com/Maheshkarri4444/wtexamify/models"
	"github.com/Maheshkarri4444/wtexamify/websockets"
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

	// Determine number of questions based on exam type
	var questionCount int
	switch exam.ExamType {
	case "viva":
		questionCount = 10
	default: // "internal" or "external"
		questionCount = 3
	}

	// Ensure there are enough questions to assign
	if len(exam.Questions) < questionCount {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Not enough questions in the exam"})
		return
	}

	// Shuffle and select random questions
	rand.Seed(time.Now().UnixNano())
	rand.Shuffle(len(exam.Questions), func(i, j int) { exam.Questions[i], exam.Questions[j] = exam.Questions[j], exam.Questions[i] })

	selectedQuestions := exam.Questions[:questionCount]
	data := make([]map[string]string, questionCount)
	for i, q := range selectedQuestions {
		data[i] = map[string]string{q: ""}
	}

	// Create answer sheet
	answerSheetID := primitive.NewObjectID()
	answerSheet := models.AnswerSheet{
		ID:           answerSheetID,
		ExamID:       examID,
		ExamType:     exam.ExamType, // Store exam type
		Duration:     exam.Duration,
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
	// Get student email from middleware
	studentEmail, _ := c.Get("email")

	// Get request data
	var request struct {
		AnswerSheetID string              `json:"answer_sheet_id"`
		Answers       []map[string]string `json:"answers"`
		AIScore       float64             `json:"ai_score,omitempty"`
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
		c.JSON(http.StatusNotFound, gin.H{"error": "Answer sheet not found or access denied"})
		return
	}

	// Update answer sheet with submitted answers
	update := bson.M{
		"$set": bson.M{
			"data":          request.Answers,
			"ai_score":      request.AIScore,
			"submit_status": true, // Mark as submitted
		},
	}

	_, err = answerSheetCollection.UpdateOne(context.TODO(), bson.M{"_id": answerSheetID}, update)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to submit answer sheet"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Answer sheet submitted successfully"})
}

func RefreshAnswerSheet(c *gin.Context) {
	answerSheetID := c.Param("id")

	// Find the existing answer sheet
	var answerSheet models.AnswerSheet
	err := answerSheetCollection.FindOne(context.TODO(), bson.M{"_id": answerSheetID}).Decode(&answerSheet)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Answer sheet not found"})
		return
	}

	// Ensure the answer sheet is not submitted
	if answerSheet.SubmitStatus {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot refresh a submitted answer sheet"})
		return
	}

	// Fetch the associated exam
	var exam models.Exam
	err = examCollection.FindOne(context.TODO(), bson.M{"_id": answerSheet.ExamID}).Decode(&exam)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Exam not found"})
		return
	}

	// Shuffle questions based on exam type
	var numQuestions int
	if exam.ExamType == "viva" {
		numQuestions = 10
	} else {
		numQuestions = 3
	}

	questions := exam.Questions
	if len(questions) < numQuestions {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Not enough questions in the exam"})
		return
	}

	rand.Seed(time.Now().UnixNano())
	rand.Shuffle(len(questions), func(i, j int) { questions[i], questions[j] = questions[j], questions[i] })

	// Update answer sheet with new questions
	updatedData := make([]map[string]string, numQuestions)
	for i, q := range questions[:numQuestions] {
		updatedData[i] = map[string]string{q: ""}
	}

	_, err = answerSheetCollection.UpdateOne(context.TODO(), bson.M{"_id": answerSheet.ID}, bson.M{
		"$set": bson.M{"data": updatedData},
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update answer sheet"})
		return
	}

	// Notify clients about the update
	responseData := gin.H{
		"message":      "Answer sheet refreshed",
		"answerSheet":  answerSheet.ID,
		"newQuestions": updatedData,
	}
	jsonMessage, _ := json.Marshal(responseData)
	websockets.Manager.Broadcast(jsonMessage)

	c.JSON(http.StatusOK, responseData)
}

func AssignCopied(c *gin.Context) {
	// Get answerSheet ID from URL params
	answerSheetID, err := primitive.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid answer sheet ID"})
		return
	}

	// Update the AnswerSheet to set copied = true
	_, err = answerSheetCollection.UpdateOne(context.TODO(), bson.M{"_id": answerSheetID}, bson.M{
		"$set": bson.M{"copied": true},
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update answer sheet"})
		return
	}

	// Update the StudentContainer to set copied = true
	_, err = studentContainerCollection.UpdateOne(context.TODO(), bson.M{
		"question_papers.answer_sheet_id": answerSheetID,
	}, bson.M{
		"$set": bson.M{"question_papers.$.copied": true},
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update student container"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Copied assigned successfully"})
}

func RemoveCopied(c *gin.Context) {
	// Get answerSheet ID from URL params
	answerSheetID, err := primitive.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid answer sheet ID"})
		return
	}

	// Get passcode from request body
	var request struct {
		Passcode string `json:"passcode"`
	}
	if err := c.ShouldBindJSON(&request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request data"})
		return
	}

	// Verify passcode
	if request.Passcode != "directedbyvasu" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid passcode"})
		return
	}

	// Update the AnswerSheet to set copied = false
	_, err = answerSheetCollection.UpdateOne(context.TODO(), bson.M{"_id": answerSheetID}, bson.M{
		"$set": bson.M{"copied": false},
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update answer sheet"})
		return
	}

	// Update the StudentContainer to set copied = false
	_, err = studentContainerCollection.UpdateOne(context.TODO(), bson.M{
		"question_papers.answer_sheet_id": answerSheetID,
	}, bson.M{
		"$set": bson.M{"question_papers.$.copied": false},
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update student container"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Copied removed successfully"})
}

func GetAllSubmittedAnswerSheets(c *gin.Context) {
	examID, err := primitive.ObjectIDFromHex(c.Param("examID"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid exam ID"})
		return
	}

	// Find submitted answer sheets
	var answerSheets []models.AnswerSheet
	cursor, err := answerSheetCollection.Find(context.TODO(), bson.M{
		"exam_id":       examID,
		"submit_status": true, // Only fetch submitted answer sheets
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch answer sheets"})
		return
	}
	defer cursor.Close(context.TODO())

	// Decode answer sheets
	if err := cursor.All(context.TODO(), &answerSheets); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Error processing data"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"submitted_answersheets": answerSheets})
}

// GetAnswerSheetByID retrieves a specific answer sheet by ID
func GetAnswerSheetByID(c *gin.Context) {
	answerSheetID, err := primitive.ObjectIDFromHex(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid answer sheet ID"})
		return
	}

	var answerSheet models.AnswerSheet
	err = answerSheetCollection.FindOne(context.TODO(), bson.M{"_id": answerSheetID}).Decode(&answerSheet)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Answer sheet not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"answerSheet": answerSheet})
}
