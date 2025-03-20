package controllers

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/Maheshkarri4444/wtexamify/config.go"
	"github.com/Maheshkarri4444/wtexamify/models"
	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
)

var examCollection *mongo.Collection = config.GetCollection(config.Client, "exams")

// CreateExam - Create a new exam
func CreateExam(c *gin.Context) {
	var exam models.Exam

	if err := c.ShouldBindJSON(&exam); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	// Extract teacher container ID from context
	containerID, exists := c.Get("container_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized user"})
		return
	}
	containerObjID, _ := containerID.(primitive.ObjectID)

	exam.ID = primitive.NewObjectID()
	exam.Status = "stop" // Default status
	exam.ExamType = strings.ToLower(exam.ExamType)
	if exam.ExamType != "internal" && exam.ExamType != "external" && exam.ExamType != "viva" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid exam type"})
		return
	}

	exam.CreatedAt = primitive.NewDateTimeFromTime(time.Now())
	exam.UpdatedAt = primitive.NewDateTimeFromTime(time.Now())

	_, err := examCollection.InsertOne(context.TODO(), exam)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create exam"})
		return
	}

	// Update TeacherContainer to store the created ExamID
	update := bson.M{"$push": bson.M{"exams": bson.M{"exam_id": exam.ID}}}
	_, err = teacherContainerCollection.UpdateOne(context.TODO(), bson.M{"_id": containerObjID}, update)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update teacher container"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"message": "Exam created successfully", "exam": exam})
}

// UpdateExam - Update an existing exam
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
	if len(updateData.Questions) > 0 {
		updateFields["questions"] = updateData.Questions
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

	result, err := examCollection.UpdateOne(context.TODO(), bson.M{"_id": objID}, bson.M{"$set": updateFields})
	if err != nil || result.MatchedCount == 0 {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update exam"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Exam updated successfully"})
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
