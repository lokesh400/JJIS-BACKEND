// EJS route: Study page (purchased test series)
require('dotenv').config();
const express       = require('express');
const http          = require('http');
const socketIo      = require('socket.io');
const cors          = require('cors');
const session       = require('express-session');
const MongoStore    = require('connect-mongo').MongoStore;
const passport      = require('./config/passport'); // configures passport strategies
const helmet        = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const connectDB     = require('./config/db');
const axios         = require('axios');

const { auth } = require('./middleware/auth')

// Connect to database
connectDB();

const app    = express();
const server = http.createServer(app);
const io     = socketIo(server);
const isProd = process.env.NODE_ENV === 'production';
const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
const sessionCookieSameSite = (
  process.env.SESSION_COOKIE_SAMESITE || (isProd ? 'lax' : 'lax')
).toLowerCase();
const sessionCookieSecure = isProd || sessionCookieSameSite === 'none';
const allowedOrigins = [
  'http://localhost:5000',
  'http://localhost:3000',
  'http://localhost:8081',
  'https://dashboard.garudclasses.com',
  'http://localhost:3030',
];


// ── Security headers (helmet) ───────────────────────────────────────────────────
// CSP is disabled here so existing inline scripts and Tailwind/Razorpay CDN
// resources keep working. Enable & tighten with a nonce strategy when ready.
app.use(helmet({
  contentSecurityPolicy:    false, // configure separately when ready
  crossOriginEmbedderPolicy: false, // Razorpay iframe requires this off
}));

// ── View engine ─────────────────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');
app.use(express.static(__dirname + '/public'));

// ── CORS ─────────────────────────────────────────────────────────────────
const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.warn(`Blocked CORS origin: ${origin}`);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  optionsSuccessStatus: 204,
};


// app.use(cors());
// app.use(session({
//     secret: 'mysessionsecret',
//     resave: false,
//     saveUninitialized: false,
//     store: MongoStore.create({
//     mongoUrl:   mongoUri,
//     ttl:        7 * 24 * 60 * 60,        // 7 days (seconds)
//     autoRemove: 'native',
//   }),
// }));

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));


// ── Body parsers ───────────────────────────────────────────────────────────
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ── NoSQL injection sanitizer ─────────────────────────────────────────────────────
// Strips $ and . from req.body, req.params, req.query
app.use(mongoSanitize());

// ── Startup env guard ─────────────────────────────────────────────────────
if (!process.env.SESSION_SECRET) {
  console.error('FATAL: SESSION_SECRET env variable is not set.');
  process.exit(1);
}
if (!mongoUri) {
  console.error('FATAL: MongoDB URI is missing. Set MONGODB_URI (or MONGO_URI) in environment variables.');
  process.exit(1);
}

// Render sits behind a reverse proxy; trust it so secure cookies are set correctly.
if (isProd) {
  app.set('trust proxy', 1);
}

// ── Session ─────────────────────────────────────────────────────────────────
app.use(session({
  name:              'sid',              // don't leak framework name via cookie
  secret:            process.env.SESSION_SECRET,
  resave:            false,
  saveUninitialized: false,
  proxy:             isProd,
  store: MongoStore.create({
    mongoUrl:   mongoUri,
    ttl:        7 * 24 * 60 * 60,        // 7 days (seconds)
    autoRemove: 'native',
  }),
  cookie: {
    httpOnly: true,                      // JS cannot read the cookie
    secure:   sessionCookieSecure,       // HTTPS-only; required when SameSite=None
    sameSite: sessionCookieSameSite,     // strict/lax/none (env configurable)
    maxAge:   7 * 24 * 60 * 60 * 1000,  // 7 days (ms)
  },
}));

// ── Passport ─────────────────────────────────────────────────────────────────
app.use(passport.initialize());
app.use(passport.session());

// ── Razorpay sensor permissions & clickjack protection ─────────────────────
app.use((req, res, next) => {
  res.setHeader(
    'Permissions-Policy',
    'accelerometer=*, gyroscope=*, magnetometer=*, payment=*, camera=*'
  );
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

// ── Inject canonical page URL into every EJS template ───────────────────────
app.use((req, res, next) => {
  res.locals.pageUrl = 'https://dashboard.garudclasses.com' + req.path;
  next();
});

app.get('/account/delete', (req, res) => res.render('account-delete', { title: 'Account Deletion Policy' }));

// ── Page routes (EJS views) ────────────────────────────────────────────────────
app.use('/', require('./routes/public/pages'));
app.use('/', require('./routes/admin/pages'));
app.use('/', require('./routes/student/pages'));
app.use('/', require('./routes/admin/course-pages'));
app.use('/', require('./routes/teacher/pages'));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',        require('./routes/auth'));
app.use('/api/subjects',    require('./routes/subjects'));
app.use('/api/chapters',    require('./routes/chapters'));
app.use('/api/topics',      require('./routes/topics'));
app.use('/api/questions',   require('./routes/questions'));
app.use('/api/tests',       require('./routes/tests'));
app.use('/api/test-series', require('./routes/testSeries'));
app.use('/api/courses',     require('./routes/courses'));
app.use('/api/reports',     require('./routes/reports'));
app.use('/api/payments',    require('./routes/payments'));
app.use('/api/purchase',    require('./routes/purchase'));
app.use('/api/help',        require('./routes/helpsupport'));
app.use('/api/study',       require('./routes/study'));
app.use('/api/battlegrounds/admin', require('./routes/admin/battlegrounds'));
app.use('/api/battlegrounds', require('./routes/student/battlegrounds'));
app.use('/apistudy',        require('./routes/study'));
app.use('/api/live-classes', require('./routes/liveClasses'));
app.use('/api/cohorts',     require('./routes/cohorts'));

app.get('/api/exams-targeted', (req, res) => {
  res.json([
    { name: 'JEE Main', value: 'jee-main' },
    { name: 'JEE Advanced', value: 'jee-advanced' },
    { name: 'NEET', value: 'neet' }
  ]);
})

app.get('/health', (req, res) => res.status(200).send('OK'));

function startKeepAlive() {
  setInterval(async () => {
    const result = await axios.get('https://dashboard.garudclasses.com/health', { timeout: 5000 }).catch(err => {
      console.error('Keep-alive error:', err.message);
      return null;
    });
    if (result) console.log(`🔄 Keep-alive ping → ${result.status} OK`);
  }, 10000);
}

app.post('/api/test', (req, res) => {
  console.log(req.user);
  res.json({ message: 'Test endpoint is working!' });
});

// ── Custom 404 page ───────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).render('404', { title: 'Page Not Found' });
});

// ChatMessage model
const ChatMessage = require('./models/ChatMessage');

// ── Socket.io Event Handling ───────────────────────────────────────────────────
io.on('connection', (socket) => {
  let currentRoom = null;
  let currentUser = null;

  socket.on('joinRoom', async ({ classId, user }) => {
    currentRoom = `class_${classId}`;
    currentUser = user;
    socket.join(currentRoom);

    try {
      const messages = await ChatMessage.find({ classId })
        .sort({ timestamp: 1 })
        .limit(60);
      socket.emit('loadHistory', messages);
    } catch (err) {
      console.error('Chat history loading error:', err.message);
    }
  });

  socket.on('chatMessage', async ({ classId, message }) => {
    if (!currentUser || !currentRoom) return;

    try {
      const chatMsg = new ChatMessage({
        classId,
        userId: currentUser.id || currentUser._id,
        username: currentUser.username,
        role: currentUser.role,
        message: message
      });

      const savedMsg = await chatMsg.save();

      io.to(currentRoom).emit('message', {
        id: savedMsg._id,
        classId: savedMsg.classId,
        userId: savedMsg.userId,
        username: savedMsg.username,
        role: savedMsg.role,
        message: savedMsg.message,
        timestamp: savedMsg.timestamp
      });
    } catch (err) {
      console.error('Save chat message error:', err.message);
    }
  });

  socket.on('disconnect', () => {
    if (currentRoom) {
      socket.leave(currentRoom);
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Garud Classes running at http://localhost:${PORT}`);
  startKeepAlive();
});
