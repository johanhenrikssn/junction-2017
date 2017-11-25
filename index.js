'use strict'

const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const express = require('express');
const { Agent } = require('https');
const fetch = require('node-fetch');
const flatMap = require('lodash/flatMap');
const flatten = require('lodash/flatten');

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

const dateRangeLink = (link, fromDate, toDate) => `${BASE_URL}${link.href}?fromDate=${fromDate}&toDate=${toDate}`;

const transactions = (fromDate, toDate) => (
  fetch(`${BASE_URL}/v2/accounts`, DEFAULT_OPTIONS)
    .then(data => data.json())
    .then(data => (
      Promise.all(
        data.response.accounts
          .map(account => account._links.find(link => link.rel === 'transactions'))
          .filter(link => link)
          .map(link => transactionPage(dateRangeLink(link, fromDate, toDate)))
      )
    )).then(flatten)
);

const transactionPage = (link, acc = []) => (
  fetch(link, DEFAULT_OPTIONS)
    .then(data => data.json())
    .then(data => {
      const linkObject = data.response._links.find(link => link.rel === "next");
      if (!linkObject) {
        return acc;
      }
      const continuationLink = linkObject.href;
      const newLink = continuationLink.replace(/\/v2\/accounts\/FI(\w+)/, '/v2/accounts/FI$1-EUR');
      return transactionPage(`${BASE_URL}${newLink}`, acc.concat(data.response.transactions));
    })
);

app.get('/transactions', (req, res) => {
  if (req.query.fromDate && req.query.toDate) {
    transactions(req.query.fromDate, req.query.toDate)
      .then(transactions => {
        res.send(transactions);
      });
  } else {
    res.send({ error: 'Parameters fromDate and toDate are required.' });
  }
});

app.get('/balance', (req, res) => {
  if (req.query.currentDate) {
    const lastPay = getLastPaydate(req.query.currentDate);
    transactions(lastPay, req.query.currentDate)
      .then(transactions => {
        res.send({ balance: transactions.reduce((acc, item) => acc + Number(item.amount), 0) });
      });
  } else {
    res.send({ error: 'Parameters currentDate required.' });
  }
});

const getLastPaydate = (dateString) => {
  const currentDate = new Date(dateString);
  let lastPay = new Date(dateString);

  const isSameMonth = currentDate.getDate() > 25;
  if (!isSameMonth) {
    lastPay.setMonth(currentDate.getMonth() - 1);
  }

  lastPay.setDate(26);

  return lastPay.toJSON().substr(0, 10);
}

app.listen(app.get('port'), function() {
  console.log('running on port', app.get('port'))
})
