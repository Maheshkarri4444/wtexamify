package controllers

import (
	"context"
	"fmt"
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
	studentName, _ := c.Get("name")
	studentEmail, _ := c.Get("email")
	containerID, _ := c.Get("container_id")

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

	// Check if an answer sheet already exists for this student and exam
	var existingAnswerSheet models.AnswerSheet
	err = answerSheetCollection.FindOne(context.TODO(), bson.M{"exam_id": examID, "student_email": studentEmail}).Decode(&existingAnswerSheet)
	if err == nil {
		c.JSON(http.StatusOK, gin.H{"message": "Answer sheet already exists", "answerSheet": existingAnswerSheet})
		return
	}

	// Fetch the exam data
	var exam models.Exam
	err = examCollection.FindOne(context.TODO(), bson.M{"_id": examID}).Decode(&exam)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Exam not found"})
		return
	}

	// Validate if there are question sets available
	if len(exam.Sets) == 0 {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No question sets available for this exam"})
		return
	}

	// Select a random question set
	rand.Seed(time.Now().UnixNano())
	selectedSetID := exam.Sets[rand.Intn(len(exam.Sets))]

	var questionSet models.QuestionSet
	err = questionSetCollection.FindOne(context.TODO(), bson.M{"_id": selectedSetID}).Decode(&questionSet)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch question set"})
		return
	}

	data := make([]map[string]string, len(questionSet.Questions))
	for i, q := range questionSet.Questions {
		data[i] = map[string]string{q: ""}
	}

	answerSheetID := primitive.NewObjectID()
	answerSheet := models.AnswerSheet{
		ID:           answerSheetID,
		ExamID:       examID,
		ExamType:     exam.ExamType,
		Duration:     exam.Duration,
		SetNumber:    questionSet.SetNumber,
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

	c.JSON(http.StatusOK, gin.H{
		"message":     "Answer sheet created successfully",
		"answerSheet": answerSheet,
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

	id, err := primitive.ObjectIDFromHex(answerSheetID)
	if err != nil {
		fmt.Println("error at converting answerSheetID to ObjectID:", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid answer sheet ID"})
		return
	}

	// Find the existing answer sheet
	var answerSheet models.AnswerSheet
	err = answerSheetCollection.FindOne(context.TODO(), bson.M{"_id": id}).Decode(&answerSheet)
	if err != nil {
		fmt.Println("error at answersheet not found")
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
		fmt.Println("error at exam not found")
		c.JSON(http.StatusNotFound, gin.H{"error": "Exam not found"})
		return
	}

	// Select a new question set different from the current one
	if len(exam.Sets) == 0 {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "No question sets available for this exam"})
		return
	}

	var newSetID primitive.ObjectID
	var questionSet models.QuestionSet

	rand.Seed(time.Now().UnixNano())
	for {
		newSetID = exam.Sets[rand.Intn(len(exam.Sets))]
		if newSetID != id {
			break
		}
	}

	err = questionSetCollection.FindOne(context.TODO(), bson.M{"_id": newSetID}).Decode(&questionSet)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch new question set"})
		return
	}

	updatedData := make([]map[string]string, len(questionSet.Questions))
	for i, q := range questionSet.Questions {
		updatedData[i] = map[string]string{q: ""}
	}

	_, err = answerSheetCollection.UpdateOne(context.TODO(), bson.M{"_id": answerSheet.ID}, bson.M{
		"$set": bson.M{"data": updatedData, "set_number": questionSet.SetNumber},
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update answer sheet"})
		return
	}

	// Fetch updated answer sheet
	err = answerSheetCollection.FindOne(context.TODO(), bson.M{"_id": answerSheet.ID}).Decode(&answerSheet)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch updated answer sheet"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":      "Answer sheet refreshed with new set",
		"answerSheet":  answerSheet,
		"newQuestions": updatedData,
	})
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
