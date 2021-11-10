# video-sync

A server for syncing multiple video clients with each other.

# Features

- play a video simulateneously amongst multiple people
- support pausing, playing, and seeking from any user
- import videos from Plex to be used for the active video
- basic authentication

# Deployment

1. Create the .env file: `cp .env.template .env`

2. Then fill out the .env file with the appropriate details: `vim .env`

3. Then start the server with docker: `sudo docker-compose up --build -d`

# Implementation details

Frontend implemented with WebSockets with pure TypeScript compiled to JavaScript with webpack. Backend implemented with express.
