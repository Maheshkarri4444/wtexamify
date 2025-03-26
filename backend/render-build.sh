#!/usr/bin/env bash
go install golang.org/dl/go1.24.1@latest
go1.24.1 download
go1.24.1 build -tags netgo -ldflags '-s -w' -o app
./app  # Runs the compiled binary
