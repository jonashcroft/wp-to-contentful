const contentful = require('contentful-management')
const axios = require('axios')
const fs = require('fs');
const TurndownService = require('turndown')

const turndownService = new TurndownService({
  codeBlockStyle: 'fenced'
})
turndownService.addRule('fencedCodeBlock', {
  filter: function (node, options) {
    return (
      options.codeBlockStyle === 'fenced' &&
      node.nodeName === 'PRE' &&
      node.firstChild &&
      node.firstChild.nodeName === 'CODE'
    )
  },
  replacement: function (content, node, options) {
    let className = node.firstChild.getAttribute('class') || ''
    let language = (className.match(/language-(\S+)/) || [null, ''])[1]

    return (
      '\n\n' + options.fence + language + '\n' +
      node.firstChild.textContent +
      '\n' + options.fence + '\n\n'
    )
  }
})
turndownService.addRule('replaceWordPressImages', {
  filter: ['img'],
  replacement: function(content, node, options) {
    let assetUrl = contentfulData.assets.filter(asset => {
      let assertFileName = asset.split('/').pop()
      let nodeFileName = node.getAttribute('src').split('/').pop()

      if (assertFileName === nodeFileName) {
        return asset
      }
    })[0];

    return `![${node.getAttribute('alt')}](${assetUrl})`
  }
})

const wpEndpoint = `https://jonashcroft.co.uk/wp-json/wp/v2/`

const ctfData = {
  accessToken: '[ACCESS_TOKEN]',
  environment: '[ENVIRONMENT_ID]',
  spaceId: '[SPACE_ID]'
}
Object.freeze(ctfData);

const ctfClient = contentful.createClient({
  accessToken: ctfData.accessToken
})

const logSeparator = `-------`


// API Endpoints we want to get data from
let wpData = {
  'posts': [],
  'tags': [],
  'categories': [],
  'media': []
};

let apiData = {}

let contentfulData = []

function migrateContent() {
  let promises = [];

  console.log(logSeparator)
  console.log(`Getting WordPress API data`)
  console.log(logSeparator)

  // Loop over our content types and create API endpoint URLs
  for (const [key, value] of Object.entries(wpData)) {
    let wpUrl = `${wpEndpoint}${key}?per_page=90`
    promises.push(wpUrl)
  }

  // console.log(promises)
  getAllData(promises)
    .then(response =>{
      apiData = response

      mapData();

    }).catch(error => {
      console.log(error)
    })
}

function getAllData(URLs){
  return Promise.all(URLs.map(fetchData));
}

function fetchData(URL) {
  return axios
    .get(URL)
    .then(function(response) {
      return {
        success: true,
        endpoint: '',
        data: response.data
      };
    })
    .catch(function(error) {
      return { success: false };
    });
}

// Get our entire API response and filter it down to only show content that we want to include
function mapData() {
  // Get WP posts from API object

  // Loop over our conjoined data structure and append data types to each child.
  for (const [index, [key, value]] of Object.entries(Object.entries(wpData))) {
    apiData[index].endpoint = key
  }

  console.log(`Reducing API data to only include fields we want`)
  let apiPosts = getApiDataType('posts')[0];
  // Loop over posts - note: we probably /should/ be using .map() here.
  for (let [key, postData] of Object.entries(apiPosts.data)) {
    console.log(`Parsing ${postData.slug}`)
    /**
     * Create base object with only limited keys
     * (e.g. just 'slug', 'categories', 'title') etc.
     * 
     * The idea here is that the key will be your Contentful field name
     * and the value be the WP post value. We will later match the keys
     * used here to their Contentful fields in the API.
     */
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

    wpData.posts.push(fieldData)
  }

  console.log(`...Done!`)
  console.log(logSeparator)

  writeDataToFile(wpData, 'wpPosts');


  // for (let [index, wpPost] of wpData.posts.entries()) {
  //   let formattedPost = formatRichTextPost(wpPost.content)

  //   console.log(formattedPost)
  // }

  // return

  // console.log(logSeparator)
  createForContentful();  
}

function getPostBodyImages(postData) {
  // console.log(`- Getting content images`)
  let imageRegex = /<img\s[^>]*?src\s*=\s*['\"]([^'\"]*?)['\"][^>]*?>/g
  let bodyImages = []

  if (postData.featured_media > 0) {
    let mediaData = getApiDataType(`media`)[0];

    let mediaObj = mediaData.data.filter(obj => {
      if (obj.id === postData.featured_media) {
        return obj
      }
    })[0];

    bodyImages.push({
      link: mediaObj.source_url,
      description: mediaObj.alt_text,
      title:  mediaObj.alt_text,
      mediaId: mediaObj.id,
      postId: mediaObj.post,
      featured: true
    })
  }

  // console.log(imageRegex.exec(postData.content.rendered))
  while (foundImage = imageRegex.exec(postData.content.rendered)) {
    let alt = foundImage[0].split('alt="')[1].split('"')[0]

    bodyImages.push({
      link: foundImage[1],
      description: alt,
      title: alt,
      postId: postData.id,
      featured: false
    })
  }
  return bodyImages
}

function getPostLabels(postItems, labelType) {
  // console.log(`- Getting post ${labelType}`)
  let labels = []
  let apiTag = getApiDataType(labelType)[0];

  for (const labelId of postItems) {
    let labelName = apiTag.data.filter(obj => {
      if (obj.id === labelId) {
        return obj.name
      }
    });

    labels.push(labelName[0].name)
  }

  return labels
}

// Helper function to get a specific data tree for a type of resource.
function getApiDataType(resourceName) {
  let apiType = apiData.filter(obj => {
    if (obj.endpoint === resourceName) {
      return obj
    }
  });
  return apiType
}

function writeDataToFile(dataTree, dataType) {
  console.log(`Writing data to a file`)

  fs.writeFile(`./${dataType}.json`, JSON.stringify(dataTree, null, 2), (err) => {
    if (err) {
      console.error(err);
      return;
    };
    console.log(`...Done!`)
    console.log(logSeparator)
  });
}

function createForContentful() {
  ctfClient.getSpace(ctfData.spaceId)
  .then((space) => space.getEnvironment(ctfData.environment))
  .then((environment) => {
    buildContentfulAssets(environment);
  })
  .catch((error) => {
    console.log(error)
    return error
  })
}

function buildContentfulAssets(environment) {
  let assetPromises = []

  console.log('Building Contentful Asset Objects')

  // For every image in every post, create a new asset.
  for (let [index, wpPost] of wpData.posts.entries()) {
    for (const [imgIndex, contentImage] of wpPost.contentImages.entries()) {
      let assetObj = {
        title: {
          'en-GB': contentImage.title
        },
        description: {
          'en-GB': contentImage.description
        },
        file: {
          'en-GB': {
            contentType: 'image/jpeg',
            fileName: contentImage.link.split('/').pop(),
            upload: encodeURI(contentImage.link)
          }
        }
      }

      assetPromises.push(assetObj);
    }
  }

  let assets = []

  console.log(`Creating Contentful Assets...`)
  console.log(logSeparator)

  // getAndStoreAssets()
  // return

  createContentfulAssets(environment, assetPromises, assets)
    .then((result) => {
      console.log(`...Done!`)
      console.log(logSeparator)

      getAndStoreAssets(environment, assets)
    })
}

function getAndStoreAssets(environment, assets) {
  console.log(`Storing asset URLs in a global array to use later`)
    // Not supported with JS? Easier to get all assets and support
    axios.get(`https://api.contentful.com/spaces/${ctfData.spaceId}/environments/${ctfData.environment}/public/assets`,
    {
      headers: {
        'Authorization':`Bearer ${ctfData.accessToken}`
      }
    })
    .then((result) => {
      // console.log(result)
      contentfulData.assets = []
      for (const item of result.data.items) {
        contentfulData.assets.push(item.fields.file['en-GB'].url)
      }

      createContentfulPosts(environment, assets)

    }).catch((err) => {
      console.log(err)
      return error
    });
    console.log(`...Done!`)
    console.log(logSeparator)
}

// Create a Promise to publish all assets.
// Note that, Timeout might not be needed here, but Contentful
// rate limits were being hit.
function createContentfulAssets(environment, promises, assets) {
  return Promise.all(
    promises.map((asset, index) => new Promise(async resolve => {

      let newAsset
      // console.log(`Creating: ${post.slug['en-GB']}`)
      setTimeout(() => {
        try {
          newAsset = environment.createAsset({
            fields: asset
          })
          .then((asset) => asset.processForAllLocales())
          .then((asset) => asset.publish())
          .then((asset) => {
            console.log(`Published Asset: ${asset.fields.file['en-GB'].fileName}`);
            assets.push({
              assetId: asset.sys.id,
              fileName: asset.fields.file['en-GB'].fileName
            })
          })
        } catch (error) {
          throw(Error(error))
        }

        resolve(newAsset)
      }, 1000 + (5000 * index));
    }))
  );
}

function createContentfulPosts(environment, assets) {
  console.log(`Creating Contentful Posts...`)
  console.log(logSeparator)

  // let postFields = {}
  /**
   * Dynamically build our Contentful data object
   * using the keys we built whilst reducing the WP Post data.alias
   * 
   * Results:
   *  postTitle: {
   *    'en-GB': wpPost.postTitle
   *   },
   *  slug: {
   *    'en-GB': wpPost.slug
   *  },
   */
  let promises = []

  for (const [index, post] of wpData.posts.entries()) {
    let postFields = {}

    for (let [postKey, postValue] of Object.entries(post)) {
      // console.log(`postKey: ${postValue}`)
      if (postKey === 'content') {
        postValue = turndownService.turndown(postValue)
      }

      /**
       * Remove values/flags/checks used for this script that
       * Contentful doesn't need.
       */
      let keysToSkip = [
        'id',
        'type',
        'contentImages'
      ]

      if (!keysToSkip.includes(postKey)) {
        postFields[postKey] = {
          'en-GB': postValue
        }
      }

      if (postKey === 'featuredImage' && postValue > 0) {
        let assetObj = assets.filter(asset => {
          if (asset.fileName === post.contentImages[0].link.split('/').pop()) {
            return asset
          }
        })[0];

        postFields.featuredImage = {
          'en-GB': {
            sys: {
              type: 'Link',
              linkType: 'Asset',
              id: assetObj.assetId
            }
          }
        }
      }

      // No image and Contentful will fail if value is '0', so remove.
      if (postKey === 'featuredImage' && postValue === 0) {
        delete postFields.featuredImage
      }
    }
    promises.push(postFields)
  }

  console.log(`Post objects created, attempting to create entries...`)
  createContentfulEntries(environment, promises)
    .then((result) => {
      console.log(logSeparator);
      console.log(`Done!`);
      console.log(logSeparator);
      console.log(`The migration has completed.`)
      console.log(logSeparator);
    });
}

function createContentfulEntries(environment, promises) {
  return Promise.all(promises.map((post, index) => new Promise(async resolve => {

    let newPost

    console.log(`Attempting: ${post.slug['en-GB']}`)
  
    setTimeout(() => {
      try {
        newPost = environment.createEntry('blogPost', {
          fields: post
        })
        .then((entry) => entry.publish())
        .then((entry) => {
          console.log(`Success: ${entry.fields.slug['en-GB']}`)
        })
      } catch (error) {
        throw(Error(error))
      }

      resolve(newPost)
    }, 1000 + (5000 * index));
  })));
}

// Ideally we'd be using Markdown here, but I like the RichText editor 🤡
function formatRichTextPost(content) {
  // TODO: split  at paragraphs, create a node for each.
  console.log(logSeparator)

  // turndownService.remove('code')
  let markdown = turndownService.turndown(content)

  // console.log(logSeparator)
  // console.log(markdown)

  // let imageLinks = /!\[[^\]]*\]\((.*?)\s*("(?:.*[^"])")?\s*\)/g
  // let imageRegex = /<img\s[^>]*?src\s*=\s*['\"]([^'\"]*?)['\"][^>]*?>/g

  // while (foundImage = imageLinks.exec(markdown)) {
    // console.log(foundImage[0])
    // let alt = foundImage[0].split('alt="')[1].split('"')[0]
  // }


  /**
   * https://www.contentful.com/developers/docs/concepts/rich-text/
   */

  /**
   *     "expected": [
          "blockquote",
          "embedded-asset-block",
          "embedded-entry-block",
          "heading-1",
          "heading-2",
          "heading-3",
          "heading-4",
          "heading-5",
          "heading-6",
          "hr",
          "ordered-list",
          "paragraph",
          "unordered-list"
        ]
   */

  // let contentor = {
  //   content: [
  //     {
  //       nodeType:"paragraph",
  //       data: {},
  //       content: [
  //         {
  //           value: content,
  //           nodeType:"text",
  //           marks: [],
  //           data: {}
  //         }
  //       ]
  //     },
  //     // {
  //     //   nodeType:"paragraph",
  //     //   data: {},
  //     //   content: [
  //     //     {
  //     //       value: "lorem hello world two",
  //     //       nodeType:"text",
  //     //       marks: [],
  //     //       data: {}
  //     //     }
  //     //   ]
  //     // },
  //   ],
  //   data: {},
  //   nodeType: 'document'
  // };

  return markdown
}

migrateContent();
