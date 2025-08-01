"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const csurf_1 = __importDefault(require("csurf"));
const interceptors_1 = require("./interceptors");
const config_1 = require("@nestjs/config");
const redis_adapter_1 = require("./redis/redis.adapter");
const payment_queue_1 = require("./queues/payment.queue");
const notifications_queue_1 = require("./queues/notifications.queue");
const onchain_queue_1 = require("./queues/onchain.queue");
require("./queues/onchain.worker");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    const configService = app.get(config_1.ConfigService);
    const redisAdapter = new redis_adapter_1.RedisIoAdapter(app);
    app.use((0, cookie_parser_1.default)());
    app.use((0, csurf_1.default)({
        cookie: {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
        },
    }));
    app.useGlobalInterceptors(new interceptors_1.ResponseInterceptor(), new interceptors_1.LoggingInterceptor(), new interceptors_1.ErrorInterceptor(), new interceptors_1.TimeoutInterceptor(), new interceptors_1.TransformInterceptor());
    try {
        await redisAdapter.connectToRedis();
        app.useWebSocketAdapter(redisAdapter);
        console.log('Redis adapter status:', redisAdapter.getStatus());
    }
    catch (error) {
        console.error('Redis adapter failed:', error.message);
        console.log('Falling back to in-memory adapter');
    }
    app.enableCors({
        origin: ['http://localhost:5000'],
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
    });
    try {
        await Promise.all([
            payment_queue_1.paymentQueue.waitUntilReady(),
            notifications_queue_1.notificationsQueue.waitUntilReady(),
            onchain_queue_1.onchainQueue.waitUntilReady(),
        ]);
        console.log('All queues are live');
        setInterval(async () => {
            const jobCounts = await Promise.all([
                payment_queue_1.paymentQueue.getJobCounts(),
                notifications_queue_1.notificationsQueue.getJobCounts(),
                onchain_queue_1.onchainQueue.getJobCounts(),
            ]);
            console.log('Queue Metrics:', {
                payment: jobCounts[0],
                notifications: jobCounts[1],
                onchain: jobCounts[2],
            });
        }, 60000);
    }
    catch (err) {
        console.error('Queue initialization failed', err);
        process.exit(1);
    }
    await app.listen(process.env.PORT ?? 9000);
}
bootstrap();
//# sourceMappingURL=main.js.map