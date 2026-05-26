数学建模云资料站部署说明

你现在有一个可以上云的静态网站：
C:\Users\杨乐然\Desktop\mathmodel_cloud_site

推荐方案
1. GitHub Pages / Cloudflare Pages / Vercel：负责让网站一直在线。
2. Supabase：负责账号登录、资料记录、协作笔记、文件存储。
3. 固定姓名和统一密码控制队内入口，Supabase 保存协作笔记和上传文件。

第一步：创建 Supabase 项目
1. 打开 https://supabase.com/ 并登录。
2. New project，新建项目。
3. 进入 SQL Editor，运行：
   supabase/schema.sql
4. 在 Project Settings -> API 里复制：
   Project URL
   anon public key
5. 打开 assets/config.js，把这两个值填进去：
   SUPABASE_URL
   SUPABASE_ANON_KEY

第二步：启用固定登录权限
1. 回到 Supabase SQL Editor。
2. 运行：
   supabase/fixed-login-policies.sql
3. 网站固定登录信息：
   杨乐然 / 代码手 / 123123123123
   邢凯轶 / 论文手 / 123123123123
   保竣然 / 建模手 / 123123123123
4. 这套方式适合队内轻量协作，不需要邮箱确认。

第三步：导入原来的资料库
1. 登录网站。
2. 打开“资料导入”。
3. 第一次选择 mathmodel_project 里的 problem_files 文件夹上传。
4. 第二次选择 mathmodel_project 里的 paper_output 文件夹上传。
5. 上传完成后，“资料库”里对应文件会变成“已上云”，队友可以在线打开。

第四步：部署成公网网址
GitHub Pages 简版：
1. 在 GitHub 新建一个仓库，比如 mathmodel-cloud-site。
2. 把 mathmodel_cloud_site 文件夹里的所有文件上传到仓库。
3. Settings -> Pages。
4. Source 选择 main branch / root。
5. 保存后等待 GitHub 给出网址。

Cloudflare Pages 简版：
1. 打开 https://dash.cloudflare.com/。
2. Workers & Pages -> Create -> Pages。
3. 连接 GitHub 仓库。
4. Framework preset 选 None。
5. Build command 留空，Output directory 留空或填 /。

重要提醒
1. assets/config.js 里的 Supabase anon key 是公开前端密钥，不是数据库管理员密钥。
2. 不要把 service_role key 放进网站。
3. 如果只用 GitHub Pages 而不用 Supabase，就只能浏览静态目录，不能真正多人上传和协作。
4. 如果你电脑关机，GitHub Pages/Cloudflare Pages 上的网站不会消失。
