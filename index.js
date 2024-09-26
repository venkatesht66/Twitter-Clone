const express = require('express')
const app = express()
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
app.use(express.json())

const path = require('path')
const dbPath = path.join(__dirname, 'twitterClone.db')
let db = null
const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server is running at http://localhost:3000')
    })
  } catch (e) {
    console.log(`DB Error: ${e.message}`)
    process.exit(1)
  }
}
initializeDBAndServer()

app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const getUserNameQuery = `SELECT * FROM user WHERE username='${username}';`
  const getUserName = await db.get(getUserNameQuery)
  if (getUserName === undefined) {
    if (password.length < 6) {
      response.status(400)
      response.send(`Password is too short`)
    } else {
      const hashedPassword = await bcrypt.hash(password, 10)
      const insertUserQuery = `INSERT INTO user (name,username,password,gender) VALUES ('${name}','${username}','${hashedPassword}','${gender}');`
      await db.run(insertUserQuery)
      response.send('User created successfully')
    }
  } else {
    response.status(400)
    response.send(`User already exists`)
  }
})

app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const getUserQuery = `SELECT * FROM user WHERE username = '${username}';`
  const getUser = await db.get(getUserQuery)
  if (getUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const checkPassword = await bcrypt.compare(password, getUser.password)
    if (checkPassword) {
      const payload = {username: username}
      const jwtToken = await jwt.sign(payload, 'twitter')
      response.send({jwtToken: jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

const authentication = async (request, response, next) => {
  let auth
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    auth = authHeader.split(' ')[1]
  }
  if (auth === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    await jwt.verify(auth, 'twitter', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        next()
      }
    })
  }
}

app.get('/user/tweets/feed/', authentication, async (request, response) => {
  let {username} = request
  const getSelectedUserQuery = `SELECT user_id FROM user WHERE username = '${username}';`
  const getSelectedUser = await db.get(getSelectedUserQuery)
  const combineUserFollowerQuery = `SELECT username,tweet,date_time AS dateTime FROM follower INNER JOIN user ON follower.following_user_id = user.user_id INNER JOIN tweet ON user.user_id = tweet.user_id
 WHERE follower_user_id=${getSelectedUser.user_id} ORDER BY tweet.date_time DESC LIMIT 4 `
  const combineUserFollower = await db.all(combineUserFollowerQuery)
  response.send(combineUserFollower)
})

app.get('/user/following/', authentication, async (request, response) => {
  let {username} = request
  const getSelectedUserQuery = `SELECT user_id FROM user WHERE username = '${username}';`
  const getSelectedUser = await db.get(getSelectedUserQuery)
  const combineUserQuery = `SELECT user.name FROM follower INNER JOIN user ON  follower.following_user_id = user.user_id WHERE follower.follower_user_id = ${getSelectedUser.user_id};`
  const combineUserFollower = await db.all(combineUserQuery)
  response.send(combineUserFollower)
})

app.get('/user/followers/', authentication, async (request, response) => {
  let {username} = request
  const getSelectedUserQuery = `SELECT user_id FROM user WHERE username = '${username}';`
  const getSelectedUser = await db.get(getSelectedUserQuery)
  const combineFollowersQuery = `SELECT user.name FROM follower INNER JOIN user ON  follower.follower_user_id = user.user_id WHERE follower.following_user_id = ${getSelectedUser.user_id};`
  const combineFollower = await db.all(combineFollowersQuery)
  response.send(combineFollower)
})

app.get('/tweets/:tweetId/', authentication, async (request, response) => {
  const {tweetId} = request.params
  const {username} = request
  const getSelectedUserQuery = `SELECT user_id FROM user WHERE username = '${username}';`
  const getSelectedUser = await db.get(getSelectedUserQuery)

  const getTweetQuery = `SELECT user_id FROM tweet WHERE tweet_id = ${tweetId};`
  const getTweet = await db.get(getTweetQuery)

  const checkQuery = `SELECT following_user_id FROM follower WHERE follower_user_id = ${getSelectedUser.user_id}`
  const check = await db.all(checkQuery)
  let arr = []
  for (let i of check) {
    arr.push(i.following_user_id)
  }

  if (arr.includes(getTweet.user_id)) {
    const getTweetDetailsQuery = `SELECT tweet,(SELECT COUNT(*) FROM tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id WHERE tweet.tweet_id = ${tweetId}) AS likes,
    (SELECT COUNT(*) FROM tweet INNER JOIN reply ON tweet.tweet_id = reply.tweet_id WHERE tweet.tweet_id = ${tweetId}) AS replies,date_time AS dateTime
    FROM tweet WHERE tweet_id = ${tweetId} `
    const getTweetObj = await db.get(getTweetDetailsQuery)
    response.send(getTweetObj)
  } else {
    response.status(401)
    response.send(`Invalid Request`)
  }
})

app.get(
  '/tweets/:tweetId/likes/',
  authentication,
  async (request, response) => {
    const {tweetId} = request.params
    const {username} = request
    const getSelectedUserQuery = `SELECT user_id FROM user WHERE username = '${username}';`
    const getSelectedUser = await db.get(getSelectedUserQuery)

    const getTweetQuery = `SELECT user_id FROM tweet WHERE tweet_id = ${tweetId};`
    const getTweet = await db.get(getTweetQuery)

    const checkQuery = `SELECT following_user_id FROM follower WHERE follower_user_id = ${getSelectedUser.user_id}`
    const check = await db.all(checkQuery)
    let arr = []
    for (let i of check) {
      arr.push(i.following_user_id)
    }

    if (arr.includes(getTweet.user_id)) {
      const getLikesQuery = `SELECT username FROM like INNER JOIN user ON like.user_id = user.user_id  WHERE like.tweet_id = ${tweetId};`
      const getlike = await db.all(getLikesQuery)
      const arr2 = []
      for (let i of getlike) {
        arr2.push(i.username)
      }
      response.send({likes: arr2})
    } else {
      response.status(401)
      response.send(`Invalid Request`)
    }
  },
)

app.get(
  '/tweets/:tweetId/replies/',
  authentication,
  async (request, response) => {
    const {tweetId} = request.params
    const {username} = request
    const getSelectedUserQuery = `SELECT user_id FROM user WHERE username = '${username}';`
    const getSelectedUser = await db.get(getSelectedUserQuery)

    const getTweetQuery = `SELECT user_id FROM tweet WHERE tweet_id = ${tweetId};`
    const getTweet = await db.get(getTweetQuery)

    const checkQuery = `SELECT following_user_id FROM follower WHERE follower_user_id = ${getSelectedUser.user_id}`
    const check = await db.all(checkQuery)
    let arr = []
    for (let i of check) {
      arr.push(i.following_user_id)
    }

    if (arr.includes(getTweet.user_id)) {
      const getRepliesQuery = `SELECT name,reply FROM reply INNER JOIN user ON reply.user_id = user.user_id  WHERE reply.tweet_id = ${tweetId};`
      const getReplies = await db.all(getRepliesQuery)
      response.send({replies: getReplies})
    } else {
      response.status(401)
      response.send(`Invalid Request`)
    }
  },
)

app.get('/user/tweets/', authentication, async (request, response) => {
  const {username} = request
  const getUserQuery = `SELECT user_id FROM user WHERE username = '${username}'`
  const getUser = await db.get(getUserQuery)
  const getTweetsUser = `SELECT tweet,
  (SELECT COUNT(*) FROM tweet INNER JOIN like ON tweet.tweet_id = like.tweet_id WHERE tweet.user_id = ${getUser.user_id}) AS likes,
  (SELECT COUNT(*) FROM tweet INNER JOIN reply ON tweet.tweet_id = reply.tweet_id WHERE tweet.user_id = ${getUser.user_id}) AS replies,
  date_time AS dateTime
   FROM tweet WHERE tweet.user_id = ${getUser.user_id}`
  const getTweet = await db.all(getTweetsUser)
  response.send(getTweet)
})

app.post('/user/tweets/', authentication, async (request, response) => {
  const {username} = request
  const {tweet} = request.body
  const date = new Date()
  const getDate = `${date.getFullYear()}-${
    date.getMonth() + 1
  }-${date.getDate()} ${
    date.getHours
  }:${date.getMinutes()}:${date.getSeconds()}`
  const getUserQuery = `SELECT user_id FROM user WHERE username = '${username}'`
  const getUser = await db.get(getUserQuery)
  const createTweetQuery = `INSERT INTO tweet(tweet,user_id,date_time) VALUES('${tweet}',${getUser.user_id},'${getDate}');`
  const createTweet = await db.run(createTweetQuery)
  response.send(`Created a Tweet`)
})

app.delete('/tweets/:tweetId/', authentication, async (request, response) => {
  const {tweetId} = request.params
  const {username} = request
  const getUserQuery = `SELECT user_id FROM user WHERE username = '${username}'`
  const getUser = await db.get(getUserQuery)
  const getTweetQuery = `SELECT user_id FROM tweet WHERE tweet_id = ${tweetId};`
  const getTWeet = await db.get(getTweetQuery)
  if (getTWeet.user_id === getUser.user_id) {
    const deleteTweetQuery = `DELETE FROM tweet WHERE tweet_id = ${tweetId};`
    await db.all(deleteTweetQuery)
    response.send(`Tweet Removed`)
  } else {
    response.status(401)
    response.send(`Invalid Request`)
  }
})

module.exports = app
