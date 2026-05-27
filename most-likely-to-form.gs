function createForm() {
  const form = FormApp.create('Most Likely To...')
    .setDescription('Pick one. No snitching on who you voted for.')
    .setCollectEmail(false)
    .setAllowResponseEdits(false)
    .setShowLinkToRespondAgain(true);

  const names = [
    'Darius', 'Makar', 'Britton', 'Khaled', 'Andrew', 'Eli',
    'Matt', 'Eric Lodge', 'Eric Lyub', 'Aarav', 'Mark', 'Aidan',
    'Ihsan', 'Tristan', 'Brody', 'Rey', 'Dylan'
  ];

  const questions = [
    'Most likely to send nudes to the wrong person',
    'Most likely to have a freaky search history',
    'Most likely to have a secret OnlyFans subscription',
    'Most likely to FaceTime their situationship in front of the squad',
    'Most likely to hook up with someone in this group’s sister',
    'Most likely to get caught talking to two girls at once',
    'Most likely to slide into a teacher’s DMs',
    'Most likely to have a hidden kink',
    'Most likely to ghost after smashing',
    'Most likely to catch feelings after one night',
    'Most likely to lose it in college on a random',
    'Most likely to lie about their body count',
    'Most likely to be exposed in a group chat screenshot',
    'Most likely to be the freak in the chat but quiet in person',
    'Most likely to have a sugar mommy in college',
    'Most likely to leak their own nudes by accident',
    'Most likely to peak right now and never recover',
    'Most likely to get arrested',
    'Most likely to become a millionaire',
    'Most likely to be famous for something weird',
    'Most likely to drop out and go viral',
    'Most likely to be CEO of something shady',
    'Most likely to still live with their parents at 30',
    'Most likely to fake their resume into a six-figure job',
    'Most likely to be on the news (and not for a good reason)',
    'Most likely to have 5+ kids by 30',
    'Most likely to start a cult and actually get followers',
    'Most likely to go bankrupt before 25',
    'Most likely to never leave their hometown',
    'Gayest'
  ];

  questions.forEach(function (q) {
    form.addMultipleChoiceItem()
      .setTitle(q)
      .setChoiceValues(names)
      .setRequired(false);
  });

  Logger.log('Share this link:  ' + form.getPublishedUrl());
  Logger.log('Edit this form:   ' + form.getEditUrl());
}
