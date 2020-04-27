# A Node script to automatically migrate posts from WordPress to Contentful.



## How to use the script

This script will run in the terminal via Node. You need to have [npm installed]('https://www.npmjs.com/get-npm').

Steps to run:
### Clone The Repo

`git clone git@github.com:jonashcroft/wp-to-contentful.git`

Inside your new folder, install the packages required to run:

```bash
npm install contentful-management // Contentful Management API
npm install axios // used to GET WordPress API data
npm install fs // (optional) used to output a .json file of your WordPress posts.
npm install turndown // used to convert WordPress post HTML into Markdown.
```

### Add your details

Open up `migration.js`, you'll need to make some modifcations:

1. 
Replace the `wpEndpoint` variable with your own websites WP-JSON endpoint.
2. In your Contentful admin panel, generate Content Management API keys, and insert your credentials in the `ctfData` object, as below:
```javascript
// Contentful API requirements
const ctfData = {
  accessToken: '[ACCESS_TOKEN]',
  environment: '[ENVIRONMENT_ID]',
  spaceId: '[SPACE_ID]'
}
Object.freeze(ctfData);
```
5. Locate the `fieldData` object in the  `mapData()` function, and replace the keys with your Contentful Content Model IDs and values with your WordPress fields. (detailed in the blog post)
```javascript
 let fieldData = {
    id: postData.id,
    type: postData.type,
    postTitle: postData.title.rendered,
    slug: postData.slug,
    content: postData.content.rendered,
    publishDate: postData.date_gmt + '+00:00',
    featuredImage: postData.featured_media,
    tags: getPostLabels(postData.tags, 'tags'),
    categories: getPostLabels(postData.categories, 'categories'),
    contentImages: getPostBodyImages(postData)
 }
```
6. To run the script:

```bash
node migration.js
```

*IMPORTANT*: There is no sandbox or test environment with this script. If you run this script, it will immediately attempt to publish your new posts and assets - I am not responsible for anything that goes wrong.