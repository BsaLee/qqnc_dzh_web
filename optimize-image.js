const fs = require('fs');
const sharp = require('sharp');

const inputPath = './web/public/background.png';
const outputPath = './web/public/background-optimized.webp';

console.log('开始优化背景图片...');

sharp(inputPath)
  .resize({ width: 1920 })
  .webp({ quality: 70 })
  .toFile(outputPath)
  .then(() => {
    console.log('图片优化完成!');
    console.log('优化后图片路径:', outputPath);
    
    // 检查文件大小
    const stats = fs.statSync(outputPath);
    console.log('优化后大小:', (stats.size / 1024 / 1024).toFixed(2), 'MB');
  })
  .catch(err => {
    console.error('优化失败:', err);
  });
