const https = require('https');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

// 提取文本
function extractPlainText({ html }) {
    if (typeof html !== 'string') return '';

    // 1. 移除 <script> 和 <style> 标签及其内部内容（包括可能的属性）
    let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ');

    // 2. 移除所有其他 HTML 标签
    text = text.replace(/<[^>]*>/g, ' ');

    // 3. 解码常见 HTML 实体（手动映射）
    const entities = {
        '&nbsp;': ' ',
        '&lt;': '<',
        '&gt;': '>',
        '&amp;': '&',
        '&quot;': '"',
        '&apos;': "'",
    };
    text = text.replace(/&[a-zA-Z]+;/g, (entity) => entities[entity] || entity);

    // 4. 合并多个空白字符（空格、换行等）为单个空格，并去除首尾空白
    text = text.replace(/\s+/g, ' ').trim();

    return text || '无法提取文本内容';
}

module.exports = {
    extractPlainText: {
        description: '从 HTML 字符串中提取纯文本，参数：HTML字符串',
        params: ['html'],
        fun: extractPlainText
    }
};