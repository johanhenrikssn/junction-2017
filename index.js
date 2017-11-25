'use strict'

const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const express = require('express');
const { Agent } = require('https');
const fetch = require('node-fetch');
const flatMap = require('lodash/flatMap');

const app = express()

dotenv.config()
app.set('port', (process.env.PORT || 5000))

app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())

const DEFAULT_OPTIONS = {
  headers: {
    'X-IBM-Client-Id': process.env.CLIENT_ID,
    'Authorization': `Bearer ${process.env.TOKEN}`,
    'X-IBM-Client-Secret': process.env.CLIENT_SECRET,
  },
  agent: new Agent({
    ecdhCurve: 'auto',
  }),
};

const BASE_URL = 'https://api.hackathon.developer.nordeaopenbanking.com';

app.get('/accounts', (req, res) => {
  fetch(`${BASE_URL}/v2/accounts`, DEFAULT_OPTIONS)
    .then(data => data.json())
    .then((data) => {
      res.send(data);
    })
    .catch((err) => {
      res.send(err);
    });
});

const transactions = () => (
  fetch(`${BASE_URL}/v2/accounts`, DEFAULT_OPTIONS)
    .then(data => data.json())
    .then(data => (
      Promise.all(
        data.response.accounts
          .map(account => account._links.find(link => link.rel === 'transactions'))
          .filter(link => link)
          .map(link => {
            return fetch(`${BASE_URL}${link.href}`, DEFAULT_OPTIONS)
              .then(data => data.json())
          })
      )
    )).then(accounts => flatMap(accounts, account => account.response.transactions))
);

app.get('/transactions', (req, res) => {
  transactions()
    .then(transactions => {
      res.send(transactions);
    });
});

app.listen(app.get('port'), function() {
  console.log('running on port', app.get('port'))
})