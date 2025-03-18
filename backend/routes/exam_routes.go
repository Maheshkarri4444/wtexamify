package routes

import (
	"github.com/Maheshkarri4444/wtexamify/controllers"
	"github.com/Maheshkarri4444/wtexamify/middleware"
	"github.com/gin-gonic/gin"
)

func ExamRoutes(r *gin.Engine) {
	exam := r.Group("/auth")
	{
		exam.POST("/exam", middleware.TeacherMiddleware(), controllers.CreateExam)
		exam.PUT("/exam/:id", middleware.TeacherMiddleware(), controllers.UpdateExam)

	}

}
