const dotenv = require('dotenv');
const schedule = require('node-schedule');
const Botkit = require('botkit');
const os = require('os');
const commandLineArgs = require('command-line-args');
const localtunnel = require('localtunnel');

const {
  balance,
  budgetBalance,
  transactions,
  dailyBudget,
  daysLeftOfMonth
} = require('../');

dotenv.config();

if (!process.env.page_token) {
  console.log('Error: Specify page_token in environment');
  process.exit(1);
}

if (!process.env.verify_token) {
  console.log('Error: Specify verify_token in environment');
  process.exit(1);
}

if (!process.env.app_secret) {
  console.log('Error: Specify app_secret in environment');
  process.exit(1);
}

const ops = commandLineArgs([
  {
    name: 'lt',
    alias: 'l',
    args: 1,
    description: 'Use localtunnel.me to make your bot available on the web.',
    type: Boolean,
    defaultValue: false
  },
  {
    name: 'ltsubdomain',
    alias: 's',
    args: 1,
    description:
      'Custom subdomain for the localtunnel.me URL. This option can only be used together with --lt.',
    type: String,
    defaultValue: null
  }
]);

if (ops.lt === false && ops.ltsubdomain !== null) {
  console.log('error: --ltsubdomain can only be used together with --lt.');
  process.exit();
}

var controller = Botkit.facebookbot({
  debug: true,
  log: true,
  access_token: process.env.page_token,
  verify_token: process.env.verify_token,
  app_secret: process.env.app_secret,
  validate_requests: true,
  json_file_store: 'db/'
});

var bot = controller.spawn({});

controller.setupWebserver(process.env.port || 3000, function(err, webserver) {
  controller.createWebhookEndpoints(webserver, bot, function() {
    console.log('ONLINE!');
    if (ops.lt) {
      var tunnel = localtunnel(
        process.env.port || 3000,
        { subdomain: ops.ltsubdomain },
        function(err, tunnel) {
          if (err) {
            console.log(err);
            process.exit();
          }
          console.log(
            'Your bot is available on the web at the following URL: ' +
              tunnel.url +
              '/facebook/receive'
          );
        }
      );

      tunnel.on('close', function() {
        console.log(
          'Your bot is no longer available on the web at the localtunnnel.me URL.'
        );
        process.exit();
      });
    }
  });
});

controller.api.nlp.enable();
controller.api.messenger_profile.greeting(
  'Hello there! The Personal Banker at your service!'
);
controller.api.messenger_profile.get_started('payload');
controller.api.messenger_profile.menu([
  {
    locale: 'default',
    composer_input_disabled: false,
    call_to_actions: [
      {
        title: 'Get Started 🎉',
        type: 'postback',
        payload: 'get_started'
      },
      {
        type: 'web_url',
        title: 'Connect to Nordea',
        url: 'http://nordeaopenbanking.com/'
      }
    ]
  },
  {
    locale: 'zh_CN',
    composer_input_disabled: false
  }
]);

controller.on('facebook_postback', async (bot, message) => {
  schedule.scheduleJob('45 * * * * *', async () => {
    var balance = await getDailyGoalBudget(message);
    bot.reply(
      message,
      `You can spend ${
        balance
      } today, and reach your monthly goal. 💪 Great job!`
    );
  });

  bot.startConversation(message, function(err, convo) {
    convo.say(
      'Alright, I will help you to save money each month. 💸 All you need to do is accept that I look at your transactions.'
    );
    convo.ask(
      {
        text: 'Have you already connected your bank account to me?',
        quick_replies: [
          {
            content_type: 'text',
            title: 'Yepp 👌',
            payload: 'yes'
          },
          {
            content_type: 'text',
            title: 'Nope 🙄',
            payload: 'no'
          }
        ]
      },
      [
        {
          pattern: bot.utterances.yes,
          callback: function(response, convo) {
            convo.ask(
              "Cool, let's get started. 🤝 How much do you want to save this month?",
              function(response, convo) {
                if (response.message.text) {
                  convo.next();
                }
              },
              { key: 'goal' }
            );
            convo.next();
          }
        },
        {
          pattern: bot.utterances.no,
          callback: function(response, convo) {
            convo.stop();
          }
        }
      ]
    );

    convo.on('end', function(convo) {
      if (convo.status == 'completed') {
        bot.reply(message, 'OK! 💯');

        controller.storage.users.get(message.user, function(err, user) {
          if (!user) {
            user = {
              id: message.user
            };
          }
          user.goal = convo.extractResponse('goal');
          controller.storage.users.save(user, function(err, id) {
            bot.reply(
              message,
              'I will remind you every day, so that you reach your goal of saving ' +
                user.goal +
                ' moneeeeys 💰💰💰'
            );
          });
        });
      } else {
        bot.reply(message, "Sorry m8! Then I can't help you...");
      }
    });
  });
});

controller.hears(
  [
    'Update save goal to (.*)',
    'Update save goal (.*)',
    'Update goal to (.*)',
    'Update goal (.*)',
    'Set save goal to (.*)',
    'Set save goal (.*)',
    'Set goal to (.*)',
    'Set goal (.*)'
  ],
  'message_received',
  function(bot, message) {
    var goal = message.match[1];
    controller.storage.users.get(message.user, function(err, user) {
      if (!user) {
        user = {
          id: message.user
        };
      }
      user.goal = goal;
      controller.storage.users.save(user, function(err, id) {
        bot.reply(
          message,
          `Alright! Updated your saving goal to ${user.goal}.`
        );
      });
    });
  }
);

controller.hears(['Remove goal', 'Clear goal'], 'message_received', function(
  bot,
  message
) {
  controller.storage.users.get(message.user, function(err, user) {
    if (!user) {
      user = {
        id: message.user
      };
    }
    user.goal = 0;
    controller.storage.users.save(user, function(err, id) {
      bot.reply(message, `Alright! Removed your set goal.`);
    });
  });
});

controller.on('message_received', (bot, message) => {
  bot.reply(
    message,
    `Let\'s chat about money. I understand commands: i.e. \'Balance\', \'Set goal 1000\', \'Remove goal\', \'Today\'s budget\'`
  );
  return false;
});

controller.hears(
  ['balance', 'Balance'],
  'message_received',
  async (bot, message) => {
    const currentBalance = await balance();
    bot.reply(message, `Your balance is ${currentBalance}.`);
  }
);

const getDailyGoalBudget = async message =>
  await controller.storage.users.get(message.user, async (err, user) => {
    if (user && user.goal) {
      var today = new Date().toISOString().split('T')[0];
      var balance = await dailyBudget(today);
      const DAYS_LEFT_OF_MONTH = 10;
      // ToDo: Round
      // Days left
      // Check that it works
      const budget = balance - parseFloat(user.goal) / DAYS_LEFT_OF_MONTH;
      return budget;
    }
  });

controller.hears(
  ['balance', 'Balance'],
  'message_received',
  async (bot, message) => {
    const currentBalance = await balance();
    bot.reply(message, `Your balance is ${currentBalance}.`);
  }
);

controller.hears(
  ['show daily budget'],
  'message_received',
  async (bot, message) => {
    const dailyGoalBudget = await getDailyGoalBudget(message);
    bot.reply(
      message,
      `Your have ${dailyGoalBudget} to spend today to reach your goal.`
    );
  }
);
