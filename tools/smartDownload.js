const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// 根据 Content-Type 推断文件扩展名
function getExtensionByType(contentType) {
    const map = {
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/gif': '.gif',
        'image/webp': '.webp',
        'text/html': '.html',
        'application/json': '.json',
        'application/pdf': '.pdf',
        'text/plain': '.txt'
    };
    return map[contentType] || '';
}

module.exports = {
    smartDownload: {
        fun: async(url) => {
            return new Promise((resolve, reject) => {
                const client = url.startsWith('https') ? https : http;
                const saveDir = process.env.DEFAULT_DOWNLOAD_PATH

                client.get(url, (response) => {
                    let finalUrl = response.url || url; // 跟随重定向
                    const contentType = response.headers['content-type'];
                    const contentDisposition = response.headers['content-disposition'];

                    // 提取文件名（如果存在）
                    let filename = '';
                    if (contentDisposition && contentDisposition.indexOf('filename=') !== -1) {
                        const match = contentDisposition.match(/filename="?([^";]+)"?/i);
                        if (match) filename = match[1];
                    }

                    // 如果没有从 header 获取文件名，则使用 URL 路径的最后一部分
                    if (!filename) {
                        const urlPath = new URL(finalUrl).pathname;
                        filename = path.basename(urlPath);
                    }

                    // 如果仍无扩展名，根据 Content-Type 补充
                    if (!path.extname(filename)) {
                        const ext = getExtensionByType(contentType.split(';')[0].trim());
                        if (ext) filename += ext;
                    }

                    const filePath = path.join(saveDir, filename);

                    const fileStream = fs.createWriteStream(filePath);
                    response.pipe(fileStream);

                    fileStream.on('finish', () => {
                        fileStream.close();
                        resolve(`文件已下载并保存至：${filePath}`);
                    });

                    fileStream.on('error', (err) => {
                        fs.unlinkSync(filePath); // 删除损坏文件
                        reject(`下载失败: ${err.message}`);
                    });
                }).on('error', (err) => {
                    reject(`请求失败: ${err.message}`);
                });
            });
        },
        description: "下载文件，支持重定向。参数：URL",
        params: ["url"]
    }
};