const dotenv = require('dotenv');
var schedule = require('node-schedule');

var j = schedule.scheduleJob('45 * * * * *', function() {
	console.log('The answer to life, the universe, and everything!');
});

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

const Botkit = require('botkit');
const os = require('os');
const commandLineArgs = require('command-line-args');
const localtunnel = require('localtunnel');

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
				title: 'My Skills',
				type: 'nested',
				call_to_actions: [
					{
						title: 'Hello',
						type: 'postback',
						payload: 'Hello'
					},
					{
						title: 'Hi',
						type: 'postback',
						payload: 'Hi'
					}
				]
			},
			{
				type: 'web_url',
				title: 'Botkit Docs',
				url: 'https://github.com/howdyai/botkit/blob/master/readme-facebook.md',
				webview_height_ratio: 'full'
			}
		]
	},
	{
		locale: 'zh_CN',
		composer_input_disabled: false
	}
]);

controller.on('facebook_postback', function(bot, message) {
	bot.startConversation(message, function(err, convo) {
		convo.say(
			'Alright, I will help you to save money each month. 💸 All you need to do is accept that I look at your transactions.'
		);
		convo.ask(
			{
				text: 'Have you already connected your Nordea account to me?',
				quick_replies: [
					{
						content_type: 'text',
						title: 'Yes',
						payload: 'yes'
					},
					{
						content_type: 'text',
						title: 'No',
						payload: 'no'
					}
				]
			},
			[
				{
					pattern: bot.utterances.yes,
					callback: function(response, convo) {
						convo.ask(
							"Cool, let's get started. How much do you want to save this month?",
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
						convo.say('NONONO');
						convo.next();
					}
				}
			]
		);

		convo.on('end', function(convo) {
			if (convo.status == 'completed') {
				bot.reply(message, 'OK!');

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
								' moneeeeys'
						);
					});
				});
			} else {
				// this happens if the conversation ended prematurely for some reason
				bot.reply(message, 'Sorry m8!');
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

controller.on('message_received', function(bot, message) {
	bot.reply(
		message,
		'Try: `what is my name` or `structured` or `call me captain`'
	);
	return false;
});
