'use strict'

const translate = require('../src/index');

translate('Space Force eyes lower-cost sensors to monitor geostationary orbit', 'en', 'zh-CN').then(value => {
    console.log(value);
})