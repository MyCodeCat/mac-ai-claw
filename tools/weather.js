const https = require('https');

const tools = {
    getWeather: {
        fun: async({ city }) => {
            const appid = process.env.OPEN_WEATHER_APPID
            const url = `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${appid}&units=metric`;
            return new Promise((resolve, reject) => {
                https.get(url, (res) => {
                    let data = '';
                    res.on('data', (chunk) => { data += chunk; });
                    res.on('end', () => {
                        try {
                            if (res.statusCode === 200) {
                                resolve(data);
                            } else {
                                reject(`错误: ${data || '未知错误'}`);
                            }
                        } catch (err) {
                            reject(`解析失败: ${err.message}`);
                        }
                    });
                }).on('error', (err) => {
                    reject(`请求失败: ${err.message}`);
                });
            });
        },
        description: "获取指定城市的天气信息，参数：城市名称（英文）",
        params: ["city"]
    },
    getPublicIP: {
        fun: async() => {
            return new Promise((resolve, reject) => {
                https.get('https://api.my-ip.io/v2/ip.json', (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => {
                        try {
                            const json = JSON.parse(data);
                            resolve(json.ip); // 返回公网IP
                        } catch (err) {
                            reject('解析失败');
                        }
                    });
                }).on('error', reject);
            });
        },
        description: "获取公网IP，无需参数",
        params: []
    },
    getCityByIP: {
        fun: async() => {
            return new Promise((resolve, reject) => {
                const options = {
                    hostname: 'api.my-ip.io',
                    port: 443,
                    path: '/v2/ip.json',
                    method: 'GET'
                };

                const req = https.request(options, (res) => {
                    let data = '';
                    res.on('data', (chunk) => { data += chunk; });
                    res.on('end', () => {
                        try {
                            const result = JSON.parse(data);
                            const city = result.city || 'Unknown';
                            resolve(city);
                        } catch (err) {
                            reject('Failed to parse response');
                        }
                    });
                });

                req.on('error', (e) => { reject(`Request error: ${e.message}`); });
                req.end();
            });
        },
        description: "获取当前城市名称，无需参数",
        params: []
    }
};
module.exports = tools