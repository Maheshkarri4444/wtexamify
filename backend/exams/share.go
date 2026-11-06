package exams

import (
	"context"
	"net/http"
	"sort"
	"strings"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// A teacher can share an exam with other teachers. They see it on their
// dashboard and do everything the owner does (settings, sets, students, the live
// monitor, unlocking, results, answer sheets), except change its questions,
// delete it or share it further.

const maxSharedTeachers = 50

// accessFor tells the frontend whose exam this is, so a teacher it was shared
// with sees who made it and gets the questions read-only.
func accessFor(ctx context.Context, c *gin.Context, e *Exam) gin.H {
	user := userFrom(c)
	owner := e.OwnerID == user.ID
	name := user.Name
	if !owner {
		name = userNames(ctx, []string{e.OwnerEmail})[e.OwnerEmail]
	}
	return gin.H{"owner": owner, "owner_email": e.OwnerEmail, "owner_name": name}
}

type teacherAccount struct {
	Email string `bson:"email" json:"email"`
	Name  string `bson:"name" json:"name"`
}

// teacherAccounts are the teachers who have signed in to Examify, other than skip.
func teacherAccounts(ctx context.Context, filter bson.M, skip string) ([]teacherAccount, error) {
	filter["role"] = "teacher"
	cursor, err := usersCol().Find(ctx, filter, options.Find().SetProjection(bson.M{"email": 1, "name": 1}))
	if err != nil {
		return nil, err
	}
	var found []teacherAccount
	if err := cursor.All(ctx, &found); err != nil {
		return nil, err
	}
	teachers := []teacherAccount{}
	for _, t := range found {
		if t.Email = strings.ToLower(strings.TrimSpace(t.Email)); t.Email != "" && t.Email != skip {
			teachers = append(teachers, t)
		}
	}
	sort.Slice(teachers, func(i, j int) bool {
		a, b := strings.ToLower(teachers[i].Name+teachers[i].Email), strings.ToLower(teachers[j].Name+teachers[j].Email)
		return a < b
	})
	return teachers, nil
}

// listTeachers lists the other teachers an exam can be shared with.
func listTeachers(c *gin.Context) {
	ctx, cancel := dbCtx()
	defer cancel()
	teachers, err := teacherAccounts(ctx, bson.M{}, userFrom(c).Email)
	if err != nil {
		respondErr(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"teachers": teachers})
}

// shareExam sets who the exam is shared with: the whole list, so an empty list
// stops sharing it. Only the owner can, and only with teachers who have signed in.
func shareExam(c *gin.Context) {
	var req struct {
		Emails []string `json:"emails"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		respondErr(c, newError(http.StatusBadRequest, "Invalid request body."))
		return
	}
	user := userFrom(c)
	emails := []string{}
	seen := map[string]bool{}
	for _, raw := range req.Emails {
		email := strings.ToLower(strings.TrimSpace(raw))
		if email == "" || email == user.Email || seen[email] {
			continue
		}
		seen[email] = true
		emails = append(emails, email)
	}
	if len(emails) > maxSharedTeachers {
		respondErr(c, newError(http.StatusBadRequest, "An exam can be shared with at most %d teachers.", maxSharedTeachers))
		return
	}
	ctx, cancel := dbCtx()
	defer cancel()
	if len(emails) > 0 {
		teachers, err := teacherAccounts(ctx, bson.M{"email": bson.M{"$in": emails}}, user.Email)
		if err != nil {
			respondErr(c, err)
			return
		}
		known := map[string]bool{}
		for _, t := range teachers {
			known[t.Email] = true
		}
		for _, email := range emails {
			if !known[email] {
				respondErr(c, newError(http.StatusBadRequest, "%s isn't a teacher on Examify. Teachers appear here after they sign in once", email))
				return
			}
		}
	}
	exam, err := modifyOwnExam(ctx, c, "share it", func(e *Exam) (bson.M, error) {
		e.SharedWith = emails
		return bson.M{"shared_with": emails}, nil
	})
	if err != nil {
		respondErr(c, err)
		return
	}
	respondBundle(ctx, c, exam, nil)
}
