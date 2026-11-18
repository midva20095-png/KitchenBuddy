'use strict';

const { normalize } = require('./text');

const RULES = [
  {
    test: /сделать бомб|как бомб|взрывчат|коктейл[ья] молотова/,
    reply: 'Я отвечаю только про еду и готовку. Напишите блюдо или продукты.'
  },
  {
    test: /наркотик|метамфетамин|героинов/,
    reply: 'Я отвечаю только про еду и готовку. Напишите блюдо или продукты.'
  },
  {
    test: /самогон|как гнать спирт|дистилл\S*\s+спирт/,
    reply: 'Домашний крепкий алкоголь не разбираю. Могу подсказать безалкогольный напиток или блюдо.'
  },
  {
    test: /суицид|как убить|отравить человека/,
    reply: 'С этим я не помогу. Если нужна помощь, позвоните на 988. Про еду могу ответить отдельно.'
  }
];

function blockedReason(text) {
  const value = normalize(text);
  if (!value) return '';
  for (const rule of RULES) {
    if (rule.test.test(value)) return rule.reply;
  }
  return '';
}

module.exports = { blockedReason };
