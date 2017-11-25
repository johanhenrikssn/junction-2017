'use strict'

const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const express = require('express');
const { Agent } = require('https');
const fetch = require('node-fetch');

const app = express()

dotenv.config()
app.set('port', (process.env.PORT || 5000))

app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())

app.get('/', function (req, res) {
  res.send('Hello world, I am a chat bot')
})

// for Facebook verification
app.get('/webhook/', function (req, res) {
  if (req.query['hub.verify_token'] === 'my_voice_is_my_password_verify_me') {
    res.send(req.query['hub.challenge'])
  }
  res.send('Error, wrong token')
})

app.get('/accounts', (req, res) => {
  const options = {
    headers: {
      'X-IBM-Client-Id': process.env.CLIENT_ID,
      'Authorization': `Bearer ${process.env.TOKEN}`,
      'X-IBM-Client-Secret': process.env.CLIENT_SECRET,
    },
    agent: new Agent({
      ecdhCurve: 'auto',
    }),
  };
  fetch('https://api.hackathon.developer.nordeaopenbanking.com/v2/accounts', options)
    .then(data => data.json())
    .then((data) => {
      res.send(data);
    })
    .catch((err) => {
      res.send(err);
    });
});

app.listen(app.get('port'), function() {
  console.log('running on port', app.get('port'))
})
