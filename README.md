<<<<<<< HEAD
# Graphite 项目介绍与开发规范指引

## 项目介绍

### 项目概述

Graphite 是一个基于 React、TypeScript 和 Vite 构建的现代化前端项目，专注于提供高性能的图形渲染能力。项目采用 PixiJS 作为核心渲染引擎，旨在为用户提供流畅的图形交互体验。

### 核心技术栈

- **框架**: React 19 + TypeScript
- **构建工具**: Vite
- **渲染引擎**: PixiJS
- **状态管理**: Zustand
- **样式**: Less + CSS Modules
- **包管理**: pnpm
- **代码质量**: ESLint + Prettier + TypeScript ESLint

### 项目结构

```
src/
├── assets/           # 静态资源文件
├── components/       # 组件目录
│   ├── canvas/       # 画布相关组件
│   └── ui/           # 通用UI组件
├── hooks/            # 自定义Hooks
├── lib/              # 第三方库封装
├── services/         # 业务逻辑层
├── stores/           # 状态管理
├── types/            # TypeScript 类型定义
└── utils/            # 工具函数
```

### 主要特性

1. 高性能图形渲染：基于 PixiJS 实现 GPU 加速渲染
2. 组件化架构：清晰的组件划分和职责分离
3. 状态管理：使用 Zustand 进行全局状态管理
4. 类型安全：全面使用 TypeScript 进行类型检查
5. 代码规范：集成 ESLint、Prettier 和 CommitLint

## 开发规范指引

### 代码规范

参考会前沟通开发规范部分～～～

### Git 提交规范

#### 1. 提交类型

- `feat`: 新功能
- `fix`: 修复 bug
- `chore`: 构建工具或辅助工具的变动
- `refactor`: 重构
- `docs`: 文档变动
- `style`: 代码格式变动
- `test`: 测试用例变动

#### 2. 提交信息格式

```
<type>(<scope>): <subject>

<body>

<footer>
```

### 代码质量保障

#### 1. 开发流程

1. 创建功能分支: `git checkout -b feature/xxx`
2. 编写代码和测试
3. 运行检查: `pnpm run lint`
4. 提交代码: `git commit -m "feat: add xxx feature"`
5. 推送分支: `git push origin feature/xxx`
6. 创建 Pull Request

#### 2. 自动化检查

- 使用 husky 和 lint-staged 在提交前自动检查代码
- 集成 tsc-files 进行 TypeScript 类型检查
- 使用 ESLint 检查代码规范
- 使用 Prettier 格式化代码

### 命令行脚本

#### 开发相关

- `pnpm dev`: 启动开发服务器
- `pnpm build`: 构建生产版本
- `pnpm preview`: 预览生产构建
- `pnpm lint`: 检查代码质量
- `pnpm format`: 格式化代码

#### CI/CD 相关

- 项目集成 GitHub Actions 进行持续集成和部署
- 代码推送到 main 或 release 分支时自动部署到 GitHub Pages

### 最佳实践

#### 1. 性能优化

- 避免不必要的重新渲染
- 使用 React.memo 优化函数组件
- 合理使用 useMemo 和 useCallback
- 懒加载非关键组件

#### 2. 可维护性

- 保持组件单一职责
- 合理拆分文件和目录
- 添加必要的注释和文档
- 统一命名规范

#### 3. 安全性

- 避免 XSS 攻击，正确处理用户输入
- 使用 HTTPS 进行数据传输
- 注意依赖包的安全更新
=======
# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
]);
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x';
import reactDom from 'eslint-plugin-react-dom';

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
]);
```
>>>>>>> 2247abf (feat: 项目初始化)
