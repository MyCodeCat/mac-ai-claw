module.exports = {
    createSpringBootProject: {
        fun: async({ projectName }) => {
            const { exec } = require('child_process');
            // 使用官方 Spring Initializr 生成 Spring Boot 3.5.3 + Java 17 项目
            // 动态替换项目名称相关的参数
            const url = `"https://start.spring.io/starter.zip?type=maven-project&language=java&bootVersion=3.5.3&baseDir=${projectName}&groupId=com.example&artifactId=${projectName}&name=${projectName}&description=Demo%20project%20for%20Spring%20Boot&packageName=com.example.${projectName}&packaging=jar&javaVersion=17&dependencies=web"`;
            const command = `curl -L ${url} -o ${projectName}.zip && unzip ${projectName}.zip && rm ${projectName}.zip`;

            console.log(`执行命令：${command}`);
            return new Promise((resolve, reject) => {
                exec(command, (error, stdout, stderr) => {
                    if (error) {
                        reject(`创建失败：${error.message}`);
                    } else {
                        resolve(`Spring Boot 项目 ${projectName} 创建成功。`);
                    }
                });
            });
        },
        description: "创建spring boot项目，续向用户询问项目名称, 参数: 项目名称",
        params: ["projectName"]
    }
};