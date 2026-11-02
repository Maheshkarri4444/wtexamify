package exams

import (
	"log"
	"net/http"
	"time"

	"github.com/Maheshkarri4444/wtexamify/middleware"
	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"
)

func RegisterRoutes(r *gin.Engine) {
	api := r.Group("/api/v2")
	api.GET("/time", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"server_now": time.Now()})
	})

	teacher := api.Group("/teacher", middleware.TeacherMiddleware())
	{
		teacher.GET("/exams", listExams)
		teacher.POST("/exams", createExam)
		teacher.GET("/exams/:id", getExam)
		teacher.PATCH("/exams/:id", patchExam)
		teacher.DELETE("/exams/:id", deleteExam)
		teacher.POST("/exams/:id/duplicate", duplicateExam)
		teacher.POST("/exams/:id/status", setStatus)
		teacher.POST("/exams/:id/codes/regenerate", regenerateCodes)

		teacher.POST("/exams/:id/questions", addQuestions)
		teacher.PUT("/exams/:id/questions/:qid", updateQuestion)
		teacher.POST("/exams/:id/questions/delete", deleteQuestions)

		teacher.POST("/exams/:id/blueprint/preview", previewBlueprint)
		teacher.PUT("/exams/:id/blueprint", saveBlueprint)
		teacher.POST("/exams/:id/sets/regenerate", reshuffleSets)

		teacher.POST("/exams/:id/students", addStudents)
		teacher.POST("/exams/:id/students/remove", removeStudents)

		teacher.GET("/exams/:id/monitor", monitor)
		teacher.POST("/exams/:id/extend", extendAll)
		teacher.GET("/exams/:id/results", results)
		teacher.GET("/exams/:id/attempts/:aid", attemptDetail)
		teacher.POST("/exams/:id/attempts/:aid/action", attemptAction)
	}

	student := api.Group("/student", middleware.StudentMiddleware())
	{
		student.GET("/exams", listMyExams)
		student.GET("/exams/:id", getMyExam)
		student.POST("/exams/:id/start", startAttempt)
		student.GET("/attempts/:aid", getAttempt)
		student.POST("/attempts/:aid/sync", syncAttempt)
		student.POST("/attempts/:aid/event", attemptEvent)
		student.POST("/attempts/:aid/unlock", unlockAttempt)
		student.POST("/attempts/:aid/refresh", refreshAttempt)
		student.POST("/attempts/:aid/submit", submitAttempt)
	}
}

// Start prepares indexes and runs the background sweeper that submits attempts
// whose time ran out while the student's browser was closed or offline.
func Start() {
	ensureIndexes()
	go func() {
		ticker := time.NewTicker(20 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			sweepExpiredAttempts()
		}
	}()
}

func sweepExpiredAttempts() {
	ctx, cancel := dbCtx()
	defer cancel()
	cursor, err := attemptsCol().Find(ctx,
		bson.M{"status": AttemptInProgress, "deadline_at": bson.M{"$lt": time.Now().Add(-submitGrace)}},
		options.Find().SetLimit(1000))
	if err != nil {
		log.Println("sweeper:", err)
		return
	}
	var expired []*Attempt
	if err := cursor.All(ctx, &expired); err != nil {
		log.Println("sweeper:", err)
		return
	}
	byExam := map[primitive.ObjectID][]*Attempt{}
	for _, att := range expired {
		byExam[att.ExamID] = append(byExam[att.ExamID], att)
	}
	for examID, attempts := range byExam {
		exam, err := loadExamByID(ctx, examID)
		if err != nil {
			log.Println("sweeper: exam", examID.Hex(), err)
			continue
		}
		if err := finalizeAttempts(ctx, exam, attempts, "time_up"); err != nil {
			log.Println("sweeper: submitting", len(attempts), "attempts:", err)
		}
	}
}
