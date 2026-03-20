const { exec } = require('child_process');

module.exports = {
    scanWifi: {
        fun: async() => {
            return new Promise((resolve, reject) => {
                // 使用 macOS 内置 airport 工具扫描 Wi-Fi
                const airportPath = '/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport';
                const cmd = `'${airportPath}' -s`;

                exec(cmd, (error, stdout, stderr) => {
                    if (error) {
                        reject('无法执行扫描：' + error.message);
                        return;
                    }
                    if (stderr) {
                        reject('扫描出错：' + stderr);
                        return;
                    }
                    resolve(stdout);
                });
            });
        },
        description: "扫描周围Wi-Fi网络，返回原始列表",
        params: []
    }
};