'use strict';

const dotenv = require('dotenv');
const { Agent } = require('https');
const fetch = require('node-fetch');
const flatten = require('lodash/flatten');

dotenv.config();

const DEFAULT_OPTIONS = {
  headers: {
    'X-IBM-Client-Id': process.env.CLIENT_ID,
    Authorization: `Bearer ${process.env.TOKEN}`,
    'X-IBM-Client-Secret': process.env.CLIENT_SECRET
  },
  agent: new Agent({
    ecdhCurve: 'auto'
  })
};

const BASE_URL = 'https://api.hackathon.developer.nordeaopenbanking.com';

const dateRangeLink = (link, fromDate, toDate) =>
  `${BASE_URL}${link.href}?fromDate=${fromDate}&toDate=${toDate}`;

const lastPayDate = dateString => {
  const currentDate = new Date(dateString);
  let lastPay = new Date(dateString);
  const isSameMonth = currentDate.getDate() > 25;
  if (!isSameMonth) {
    lastPay.setMonth(currentDate.getMonth() - 1);
  }
  lastPay.setDate(26);
  return lastPay.toJSON().substr(0, 10);
};

const daysLeftOfMonth = dateString => {
  const currentDate = new Date(dateString);
  let nextPayDate = new Date(dateString);
  const isSameMonth = currentDate.getDate() > 25;
  if (isSameMonth) {
    nextPayDate.setMonth(currentDate.getMonth() + 1);
  }
  nextPayDate.setDate(26);
  return (nextPayDate.getTime() - currentDate.getTime()) / (3600 * 24 * 1000);
};

const transactionPage = (link, acc = []) =>
  fetch(link, DEFAULT_OPTIONS)
    .then(data => data.json())
    .then(data => {
      const linkObject = data.response._links.find(link => link.rel === 'next');
      if (!linkObject) {
        return acc;
      }
      const continuationLink = linkObject.href;
      const newLink = continuationLink.replace(
        /\/v2\/accounts\/FI(\w+)/,
        '/v2/accounts/FI$1-EUR'
      );
      return transactionPage(
        `${BASE_URL}${newLink}`,
        acc.concat(data.response.transactions)
      );
    });

const balance = () =>
  fetch(`${BASE_URL}/v2/accounts`, DEFAULT_OPTIONS)
    .then(data => data.json())
    .then(data =>
      data.response.accounts
        .filter(account =>
          account._links.find(link => link.rel === 'transactions')
        )
        .map(account => account.availableBalance)
        .reduce((acc, balance) => acc + Number(balance), 0)
        .toFixed(2)
    );

const budgetBalance = currentDate => {
  if (currentDate) {
    const fromDate = lastPayDate(currentDate);
    return transactions(fromDate, currentDate).then(transactions => {
      return transactions
        .reduce((acc, item) => acc + Number(item.amount), 0)
        .toFixed(2);
    });
  }
  throw new Error('Parameter currentDate is required.');
};

const datesBetweenDates = (fromDateString, toDateString) => {
  const toDate = new Date(toDateString);
  let itDate = new Date(fromDateString);
  let dates = [];
  while (itDate < toDate) {
    itDate.setDate(itDate.getDate() + 1);
    dates.push(new Date(itDate).toISOString().split('T')[0]);
  }
  return dates;
};

const transactionsByDates = (link, dates) => {
  return Promise.all(
    dates.map(date =>
      fetch(dateRangeLink(link, date, date), DEFAULT_OPTIONS)
        .then(d => d.json())
        .then(d => d.response.transactions)
    )
  ).then(transactionsForDate => transactionsForDate.map(flatten));
};

const transactions = (fromDate, toDate) =>
  fetch(`${BASE_URL}/v2/accounts`, DEFAULT_OPTIONS)
    .then(data => data.json())
    .then(data =>
      Promise.all(
        data.response.accounts
          .map(account =>
            account._links.find(link => link.rel === 'transactions')
          )
          .filter(link => link)
          .map(link =>
            transactionsByDates(link, datesBetweenDates(fromDate, toDate))
          )
      ).then(flatten)
    )
    .then(flatten);

const dailyBudget = currentDate => {
  if (currentDate) {
    const daysLeft = daysLeftOfMonth(currentDate);
    return budgetBalance(currentDate).then(dailyBudget => {
      return (dailyBudget / daysLeft).toFixed(2);
    });
  }
  throw new Error('Parameter currentDate is required.');
};

module.exports = {
  balance,
  budgetBalance,
  transactions,
  dailyBudget,
  daysLeftOfMonth
};
