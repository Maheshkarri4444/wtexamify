package models

import "go.mongodb.org/mongo-driver/bson/primitive"

type User struct {
	ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Name        string             `bson:"name,omitempty" json:"name"`
	Email       string             `bson:"email" json:"email"`
	GoogleID    string             `bson:"google_id,omitempty" json:"google_id,omitempty"`
	Image       string             `bson:"image,omitempty" json:"image,omitempty"` // Google profile image URL
	Role        string             `bson:"role" json:"role" validate:"oneof=teacher student"`
	ContainerID primitive.ObjectID `bson:"contianer_id" json:"container_id"`
	CreatedAt   primitive.DateTime `json:"created_at" bson:"created_at"`
	UpdatedAt   primitive.DateTime `json:"updated_at" bson:"updated_at"`
}

type StudentContainer struct {
	ID             primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	QuestionPapers []struct {
		ExamID        primitive.ObjectID `bson:"exam_id" json:"exam_id"`
		AnswerSheetID primitive.ObjectID `bson:"answer_sheet_id" json:"answer_sheet_id"`
		Copied        bool               `bson:"copied" json:"copied"`
	} `bson:"question_papers" json:"question_papers"`
}

type TeacherContainer struct {
	ID    primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Exams []struct {
		ExamID primitive.ObjectID `bson:"exam_id" json:"exam_id"`
	} `bson:"exams" json:"exams"`
}

type QuestionSet struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	ExamID    primitive.ObjectID `bson:"exam_id" json:"exam_id"`
	ExamType  string             `bson:"exam_type" json:"exam_type"`
	SetNumber int                `bson:"set_number" json:"set_number"`
	Questions []string           `bson:"questions" json:"questions"`
	CreatedAt primitive.DateTime `bson:"created_at,omitempty" json:"created_at"`
}

type Exam struct {
	ID           primitive.ObjectID   `bson:"_id,omitempty" json:"id"`
	Name         string               `bson:"name" json:"name"`
	Duration     int                  `bson:"duration" json:"duration"`
	Questions    []string             `bson:"questions" json:"questions"`
	Status       string               `bson:"status" json:"status"`
	ExamType     string               `bson:"exam_type" json:"exam_type"`
	AnswerSheets []primitive.ObjectID `bson:"answer_sheets" json:"answer_sheets"`
	Sets         []primitive.ObjectID `bson:"sets" json:"sets"` // Added field
	CreatedAt    primitive.DateTime   `bson:"created_at,omitempty" json:"created_at"`
	UpdatedAt    primitive.DateTime   `bson:"updated_at,omitempty" json:"updated_at"`
}

type AnswerSheet struct {
	ID           primitive.ObjectID  `bson:"_id,omitempty" json:"id"`
	ExamID       primitive.ObjectID  `bson:"exam_id" json:"exam_id"`
	ExamType     string              `bson:"exam_type" json:"exam_type"`
	Duration     int                 `bson:"duration" json:"duration"`
	SetNumber    int                 `bson:"set_number" json:"set_number"` // New field
	StudentName  string              `bson:"student_name" json:"student_name"`
	StudentEmail string              `bson:"student_email" json:"student_email"`
	Data         []map[string]string `bson:"data" json:"data"`
	AIScore      float64             `bson:"ai_score,omitempty" json:"ai_score,omitempty"`
	Copied       bool                `bson:"copied" json:"copied"`
	CopyCount    int                 `bson:"copy_count" json:"copy_count"`
	SubmitStatus bool                `bson:"submit_status" json:"submit_status"`
	CreatedAt    primitive.DateTime  `bson:"created_at" json:"created_at"`
}
