package routes

import (
	"github.com/Maheshkarri4444/wtexamify/controllers"
	"github.com/Maheshkarri4444/wtexamify/middleware"
	"github.com/gin-gonic/gin"
)

func ExamRoutes(r *gin.Engine) {
	exam := r.Group("/exam")
	{
		exam.POST("/exam", middleware.TeacherMiddleware(), controllers.CreateExam)
		exam.PUT("/exam/:id", middleware.TeacherMiddleware(), controllers.UpdateExam)
		exam.GET("/exams/started", middleware.StudentMiddleware(), controllers.GetAllStartedExams)
		exam.GET("/teacher/:id/exams", middleware.TeacherMiddleware(), controllers.GetExamsByTeacherContainerID)
		exam.GET("/getexam/:id", middleware.StudentOrTeacherMiddleware(), controllers.GetExam)
		exam.GET("/getsets/:examID", middleware.TeacherMiddleware(), controllers.GetSetsByExamID)

		exam.POST("/send-emails", middleware.TeacherMiddleware(), controllers.SendEmails)
	}

}
