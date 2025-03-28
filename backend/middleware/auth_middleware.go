package middleware

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/Maheshkarri4444/wtexamify/config.go"
	"github.com/dgrijalva/jwt-go"
	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
)

var userCollection *mongo.Collection = config.GetCollection(config.Client, "users")

func VerifyJWT(tokenString string) (jwt.MapClaims, error) {
	token, err := jwt.Parse(tokenString, func(t *jwt.Token) (interface{}, error) {
		return []byte("maheshkarri2109"), nil
	})

	if err != nil || !token.Valid {
		return nil, err
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil, err
	}

	return claims, nil
}

func AuthMiddleware(allowedRoles ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenString := c.GetHeader("Authorization")
		if tokenString == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Authorization token required"})
			c.Abort()
			return
		}

		claims, err := VerifyJWT(tokenString)
		if err != nil {
			fmt.Println("err: ", err)
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

		// Fetch user from the database using email
		var user struct {
			ID          primitive.ObjectID `bson:"_id"`
			Name        string             `bson:"name,omitempty" json:"name"`
			Email       string             `bson:"email" json:"email"`
			Image       string             `bson:"image,omitempty" json:"image,omitempty"`
			Role        string             `bson:"role"`
			ContainerID primitive.ObjectID `bson:"contianer_id"`
		}

		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		err = userCollection.FindOne(ctx, bson.M{"email": email}).Decode(&user)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "User not found"})
			c.Abort()
			return
		}

		fmt.Println("user role:", user.Role)
		fmt.Println("allowed roles:", allowedRoles)

		// Check if user role is in the list of allowed roles
		roleAllowed := false
		for _, role := range allowedRoles {
			if user.Role == role {
				roleAllowed = true
				break
			}
		}

		if !roleAllowed {
			fmt.Println("forbidden called")
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
