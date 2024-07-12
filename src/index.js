const express = require("express");
const http = require("http");
const path = require("path");
const socketio = require("socket.io");
const formatMessage = require("./utils/formatMessage.js");
const {
  addPlayer,
  getAllPlayers,
  getPlayer,
  removePlayer,
} = require("./utils/players.js");

const { setGame, setGameStatus } = require("./utils/game.js");

const app = express();
const publicDirectoryPath = path.join(__dirname, "../public");
app.use(express.static(publicDirectoryPath));

const server = http.createServer(app);
const io = socketio(server);

io.on("connection", (socket) => {
  console.log(`A player just connected`);

  socket.on("join", ({ room, playerName }, callback) => {
    console.log({ playerName, room });
    const { error, newPlayer } = addPlayer({ id: socket.id, playerName, room });

    if (error) {
      return callback(error.message);
    }

    socket.join(newPlayer.room);
    socket.emit(
      "message",
      formatMessage("TriviAdmin", `Welcome ${newPlayer.playerName}!`)
    );

    socket.broadcast
      .to(newPlayer.room)
      .emit(
        "message",
        formatMessage(
          "TriviAdmin",
          `${newPlayer.playerName} just joined the game!`
        )
      );
    io.in(newPlayer.room).emit("room", {
      room: newPlayer.room,
      players: getAllPlayers(newPlayer.room),
    });
  });

  socket.on("disconnect", () => {
    console.log("A player disconnected.");

    const disconnectedPlayer = removePlayer(socket.id);

    if (disconnectedPlayer) {
      const { playerName, room } = disconnectedPlayer;
      io.in(room).emit(
        "message",
        formatMessage("TriviAdmin", `${playerName} has left 🥲`)
      );

      io.in(room).emit("room", {
        room,
        players: getAllPlayers(room),
      });
    }
  });

  socket.on("sendMessage", (message, callback) => {
    const { error, player } = getPlayer(socket.id);

    if (error) return callback(error.message);

    if (player) {
      io.to(player.room).emit(
        "message",
        formatMessage(player.playerName, message)
      );
      callback(); // invoke the callback to trigger event acknowledgment
    }
  });

  socket.on("getQuestion", async (data, callback) => {
    const { error, player } = getPlayer(socket.id);

    if (error) return callback(error.message);

    if (player) {
      const game = await setGame();
      io.to(player.room).emit("question", {
        playerName: player.playerName,
        ...game.prompt,
      });
    }
  });

  socket.on("sendAnswer", (answer, callback) => {
    const { error, player } = getPlayer(socket.id);

    if (error) return callback(error.message);

    if (player) {
      const { isRoundOver } = setGameStatus({
        event: "sendAnswer",
        playerId: player.id,
        room: player.room,
      });

      // Since we want to show the player's submission to the rest of the players,
      // we have to emit an event (`answer`) to all the players in the room along
      // with the player's answer and `isRoundOver`.
      io.to(player.room).emit("answer", {
        ...formatMessage(player.playerName, answer),
        isRoundOver,
      });

      callback();
    }
  });

  socket.on("getAnswer", (data, callback) => {
    const { error, player } = getPlayer(socket.id);

    if (error) return callback(error.message);

    if (player) {
      const { correctAnswer } = getGameStatus({
        event: "getAnswer",
      });
      io.to(player.room).emit(
        "correctAnswer",
        formatMessage(player.playerName, correctAnswer)
      );
    }
  });
});

/* io.on("connection", ({ room, playerName }) => {
  console.log(`${playerName} player just join ${room} room`);
}); */

const port = process.env.PORT || 8080;
server.listen(port, () => {
  console.log(`Server is up on port ${port}.`);
});
