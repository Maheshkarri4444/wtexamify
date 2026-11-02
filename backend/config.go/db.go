package config

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

var (
	clientOnce sync.Once
	client     *mongo.Client
)

// DB returns the shared MongoDB client, connecting the first time it's needed,
// so packages (and their tests) can be imported without a database.
func DB() *mongo.Client {
	clientOnce.Do(func() { client = createMongoClient() })
	return client
}

func createMongoClient() *mongo.Client {
	MongodbUri := Get("MONGODB_URI", "")
	if MongodbUri == "" {
		log.Fatal("MONGODB_URI is not set (add it to backend/.env)")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	client, err := mongo.Connect(ctx, options.Client().ApplyURI(MongodbUri))
	if err != nil {
		log.Fatal("mongo db connection error: ", err)
	}

	fmt.Println("connected to mongodb, database:", DBName())
	return client
}

// Collection returns a collection in the configured database (DB_NAME).
func Collection(collectionName string) *mongo.Collection {
	return DB().Database(DBName()).Collection(collectionName)
}
