const https = require('https');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

// 从 HTML 中提取所有 https:// 链接及其所属标签和属性
function extractUrlsWithTags({ html }) {
    const items = [];
    const tagRegex = /<(\w+)([^>]*)>/g;
    let tagMatch;
    while ((tagMatch = tagRegex.exec(html)) !== null) {
        const tagName = tagMatch[1];
        const attrsString = tagMatch[2];
        const attrRegex = /\s+(\w+)=(["']?)(.*?)\2(?:\s|>|$)/g;
        let attrMatch;
        while ((attrMatch = attrRegex.exec(attrsString)) !== null) {
            const attrName = attrMatch[1];
            let attrValue = attrMatch[3];
            // 处理相对链接
            if (attrValue.startsWith('http://') || attrValue.startsWith('https://')) {
                items.push(`${tagName}:${attrName}:${attrValue}`);
            } else if (attrValue.startsWith('/')) {
                items.push(`残缺链接：${attrValue}`)
            } else if (!attrValue.startsWith('#') && !attrValue.startsWith('javascript:')) {
                // 相对路径，拼接基础 URL
                const absolute = new URL(attrValue, baseUrl).href;
                items.push(`${tagName}:${attrName}:${absolute}`);
            }
        }
    }
    return items.join(",");
}

module.exports = {
    extractUrlsWithTags: {
        description: '从 HTML 中提取链接，参数：HTML字符串',
        params: ['html'],
        fun: extractUrlsWithTags
    }
};