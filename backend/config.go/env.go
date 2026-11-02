package config

import (
	"log"
	"os"
	"strings"
	"sync"

	"github.com/joho/godotenv"
)

var loadOnce sync.Once

// Load reads .env into the process environment once. Variables that are already
// set in the real environment win, so a server can be configured without a file.
func Load() {
	loadOnce.Do(func() {
		if err := godotenv.Load(); err != nil && !os.IsNotExist(err) {
			log.Println("could not read .env:", err)
		}
	})
}

// Get returns an environment variable, or fallback when it is empty.
func Get(key, fallback string) string {
	Load()
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

// List splits a comma-separated variable into trimmed, non-empty values.
func List(key string) []string {
	var values []string
	for _, part := range strings.Split(Get(key, ""), ",") {
		if value := strings.TrimSpace(part); value != "" {
			values = append(values, value)
		}
	}
	return values
}

// IsDevelopment is true only when APP_ENV=development. Dev-only features such as
// the test login check this, so they never switch on by accident.
func IsDevelopment() bool {
	return strings.EqualFold(Get("APP_ENV", ""), "development")
}

func DBName() string {
	return Get("DB_NAME", "wtlabexam")
}

// JWTSecret is the signing key for login tokens.
func JWTSecret() []byte {
	secret := Get("JWT_SECRET", "")
	if secret == "" {
		log.Fatal("JWT_SECRET is not set (add it to backend/.env)")
	}
	return []byte(secret)
}
