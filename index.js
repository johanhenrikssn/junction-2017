'use strict'

const dotenv = require('dotenv');
const { Agent } = require('https');
const fetch = require('node-fetch');
const flatten = require('lodash/flatten');

dotenv.config()

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

const dateRangeLink = (link, fromDate, toDate) => `${BASE_URL}${link.href}?fromDate=${fromDate}&toDate=${toDate}`;

const lastPayDate = (dateString) => {
  const currentDate = new Date(dateString);
  let lastPay = new Date(dateString);
  const isSameMonth = currentDate.getDate() > 25;
  if (!isSameMonth) {
    lastPay.setMonth(currentDate.getMonth() - 1);
  }
  lastPay.setDate(26);
  return lastPay.toJSON().substr(0, 10);
}

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

const balance = (currentDate) => {
  if (currentDate) {
    const fromDate = lastPayDate(currentDate);
    return transactions(fromDate, currentDate)
      .then(transactions => (
        transactions.reduce((acc, item) => acc + Number(item.amount), 0).toFixed(2)
      ));
  }
  throw new Error('Parameter currentDate is required.');
};

module.export = {
  balance,
  transactions,
};
