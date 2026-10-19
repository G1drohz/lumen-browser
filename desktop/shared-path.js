const { app } = require('electron');
const path = require('path');

// В разработке shared/ лежит рядом с desktop/, в сборке — в resources/shared
module.exports = app.isPackaged
  ? path.join(process.resourcesPath, 'shared')
  : path.join(__dirname, '..', 'shared');
