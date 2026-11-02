package middleware

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/Maheshkarri4444/wtexamify/config.go"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

func VerifyJWT(tokenString string) (jwt.MapClaims, error) {
	token, err := jwt.Parse(tokenString, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method %v", t.Header["alg"])
		}
		return config.JWTSecret(), nil
	})
	if err != nil {
		return nil, err
	}
	if !token.Valid {
		return nil, errors.New("invalid token")
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil, errors.New("invalid token claims")
	}

	return claims, nil
}

type authUser struct {
	ID          primitive.ObjectID `bson:"_id"`
	Name        string             `bson:"name,omitempty" json:"name"`
	Email       string             `bson:"email" json:"email"`
	Image       string             `bson:"image,omitempty" json:"image,omitempty"`
	Role        string             `bson:"role"`
	ContainerID primitive.ObjectID `bson:"contianer_id"`
}

type cachedUser struct {
	user    authUser
	expires time.Time
}

// Every exam heartbeat is authenticated, so users are cached briefly instead of
// read from the database on each request. A role change applies within 30s.
var userCache sync.Map

const userCacheTTL = 30 * time.Second

func lookupUser(email string) (authUser, error) {
	if cached, ok := userCache.Load(email); ok {
		if entry := cached.(cachedUser); time.Now().Before(entry.expires) {
			return entry.user, nil
		}
	}
	var user authUser
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := config.Collection("users").FindOne(ctx, bson.M{"email": email}).Decode(&user); err != nil {
		return user, err
	}
	userCache.Store(email, cachedUser{user: user, expires: time.Now().Add(userCacheTTL)})
	return user, nil
}

func AuthMiddleware(allowedRoles ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		// v1 sent the bare token; v2 sends "Bearer <token>". Both work.
		tokenString := strings.TrimSpace(strings.TrimPrefix(c.GetHeader("Authorization"), "Bearer "))
		if tokenString == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization token required"})
			c.Abort()
			return
		}

		claims, err := VerifyJWT(tokenString)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
			c.Abort()
			return
		}

		email, ok := claims["email"].(string)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid email in token"})
			c.Abort()
			return
		}

		user, err := lookupUser(email)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
			c.Abort()
			return
		}

		// Check if user role is in the list of allowed roles
		roleAllowed := false
		for _, role := range allowedRoles {
			if user.Role == role {
				roleAllowed = true
				break
			}
		}

		if !roleAllowed {
			c.JSON(http.StatusForbidden, gin.H{"error": "Access denied"})
			c.Abort()
			return
		}

		// Set user details in context
		c.Set("user_id", user.ID)
		c.Set("name", user.Name)
		c.Set("email", user.Email)
		c.Set("role", user.Role)
		c.Set("image", user.Image)
		c.Set("container_id", user.ContainerID)
		c.Next()
	}
}

func StudentMiddleware() gin.HandlerFunc {
	return AuthMiddleware("student")
}

func TeacherMiddleware() gin.HandlerFunc {
	return AuthMiddleware("teacher")
}

func StudentOrTeacherMiddleware() gin.HandlerFunc {
	return AuthMiddleware("student", "teacher")
}
