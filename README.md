# listen.moe music streaming Discord bot

[![Code Climate](https://codeclimate.com/github/Geo1088/listen.moe-streaming-bot/badges/gpa.svg)](https://codeclimate.com/github/Geo1088/listen.moe-streaming-bot)

A bot that streams music from [listen.moe](http://listen.moe) into your Discord channel.

## Usage

- After you've added the bot to your server, join a voice channel and type `~~join` to bind the bot to that channel. You have to have the "Manage server" permission to use this command.
- At any time, anyone can use `~~now playing`, `~~playing`, or `~~np` to see what song is being played and who requested it, if anyone.
- The bot's "game" will alternate between the server count and the currently playing song every 15 seconds.

## Run it yourself

- ` git clone <this repo>`
- `npm i`
- Rename `config-sample.json` to `config.json` and fill in your token
- `echo "{}" >> guilds.json` (soon I'll make this part unnecessary)
- `node index.js`
