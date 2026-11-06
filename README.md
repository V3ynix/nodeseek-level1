# NodeSeek 一级及以下标记与屏蔽

油猴脚本。给 NodeSeek 上 Lv.0、Lv.1 账号发的帖子和评论加个标记，看着烦可以直接屏蔽。

最近新号水帖、AI 帖太多，就写了这个。默认只标记不隐藏，毕竟新号里也有认真发帖的人。

## 安装

先装 [Tampermonkey](https://www.tampermonkey.net/)，然后点 **[这里安装脚本](https://github.com/V3ynix/nodeseek-level1/raw/refs/heads/main/nodeseek-level1.user.js)**，刷新 [NodeSeek](https://www.nodeseek.com/)，右下角会出现一个小面板。

Chrome 提示脚本不能运行的话，到扩展详情里打开「允许用户脚本」。如果链接打开只显示源码，把完整内容复制到油猴「添加新脚本」里，替换默认模板并保存也一样。

## 用法

面板上有两个开关，默认都是关的：

- 屏蔽帖子：隐藏 Lv.0 / Lv.1 作者在列表里的主题和帖子主楼，楼里别人的回复照常显示
- 屏蔽评论：只隐藏 Lv.0 / Lv.1 的回复

关掉开关马上恢复，不用刷新，开关设置也会自动保存。点面板标题可以收起来。

## 细节

等级是通过站内接口 `/api/account/getInfo/{UID}` 获取的，不按 UID 大小猜。查不到的标「等级未知」，内容照常显示。

作者多的页面要查一会儿，这期间可能先看到没标记、没屏蔽的内容。查询结果在当前标签页缓存 30 分钟，所以刚升级的人可能还会被标一阵。

现在最多同时查 4 个作者，同一个作者在本页不会重复查；页面变化时只更新受影响的内容，不再整页重扫。

脚本只改你自己浏览器里的显示，不碰站内拉黑列表，不向第三方上传数据（`@grant none`，没有外部依赖）。

只在 Chrome + Tampermonkey 上测过。NodeSeek 以后改版可能会失效，有问题可以提 [issue](https://github.com/V3ynix/nodeseek-level1/issues)。

## 更新和卸载

油猴会按自己的设置自动检查更新，也可以再点一次 [安装链接](https://github.com/V3ynix/nodeseek-level1/raw/refs/heads/main/nodeseek-level1.user.js) 覆盖安装，别重复启用多个副本。

不想用了，在油猴里禁用或删除脚本，刷新页面就行。

[MIT](./LICENSE) · 非官方项目
