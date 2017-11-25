const bodyParser = require('body-parser');
const express = require('express');
const { Agent } = require('https');
const fetch = require('node-fetch');

const app = express().use(bodyParser.json());

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

// Sets server port and logs message on success
app.listen(process.env.PORT || 1337, () => {
  console.log('server listening');
});
