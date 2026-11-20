const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const env = require('./config/env');
const routes = require('./routes');
const notFound = require('./middlewares/notFound');
const errorHandler = require('./middlewares/errorHandler');
const { globalLimiter } = require('./middlewares/rateLimit');

const app = express();

app.disable('x-powered-by');

app.use(helmet());
app.use(
  cors({
    origin: env.corsOrigin === '*' ? '*' : env.corsOrigin.split(',').map((item) => item.trim()),
  })
);
app.use(express.json({ limit: '100kb' }));

if (env.nodeEnv !== 'test') {
  app.use(morgan('dev'));
  app.use(globalLimiter);
}

app.use('/api/v1', routes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
