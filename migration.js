const contentful = require('contentful-management')
const axios = require('axios')
const fs = require('fs');

const wpEndpoint = `https://jonashcroft.co.uk/wp-json/wp/v2/`

const ctfData = {
  accessToken: 'CFPAT-GoOEMcXAMoM0e_yqFcIoV6-s8LjADlZT4qyHIlp8W1A',
  environment: 'master',
  spaceId: 'yny9a84qp5hk'
}
Object.freeze(ctfData);

const ctfClient = contentful.createClient({
  accessToken: ctfData.accessToken
})


// API Endpoints we want to get data from
let wpData = {
  'posts': [],
  'tags': [],
  'categories': [],
  'media': []
};

let apiData = {}

function migrateContent() {
  let promises = [];

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

  console.log(`Reducing posts API data to only include fields we want`)
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
  
  writeDataToFile(wpData, 'wpPosts');
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
  });
}

function createForContentful() {
  ctfClient.getSpace(ctfData.spaceId)
  .then((space) => space.getEnvironment(ctfData.environment))
  .then((environment) => {
    createContentfulAssets(environment);
  })
  .catch((error) => {
    console.log(error)
    return error
  })
}

function createContentfulAssets(environment) {
  let assets = []
  let queueLength = 0
  let queuePosition = 0

  for (let [index, wpPost] of wpData.posts.entries()) {
    for (const [imgIndex, contentImage] of wpPost.contentImages.entries()) {
      queueLength++
    }
  }

  // createContentfulPosts(environment, assets)
  // return false;

  // Create the assets FIRST so that we can attach them to posts later.
  for (let [index, wpPost] of wpData.posts.entries()) {
    setTimeout(function() {
      for (const [imgIndex, contentImage] of wpPost.contentImages.entries()) {
        // Rate limiting will occur, there is ABSOLUTLY a better way to do this.
        environment.createAsset({
          fields: {
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
        })
        .then((asset) => asset.processForAllLocales())
        .then((asset) => asset.publish())
        .then((asset) => {
          assets.push({
            assetId: asset.sys.id,
            fileName: asset.fields.file['en-GB'].fileName
          })

          console.log(`${queuePosition} vs ${queueLength}`)

          queuePosition++
          if (queuePosition === queueLength) {
            assetsPublished = true
            console.log('FINISHED')
            createContentfulPosts(environment, assets)
          }
        })
      }
    }, 1000 + (3000 * index));
  }
}

function createContentfulPosts(environment, assets) {
  console.log(`begin to publish posts...`)

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
      console.log(`postKey: ${postKey}`)
      // console.log(`postKey: ${postValue}`)

      if (postKey === 'content') {
        postValue = formatRichTextPost(postValue)
      }

      if (postKey === 'featuredImage' && postValue > 0) {
        console.log('get image')
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

      postFields[postKey] = {
        'en-GB': postValue
      }

      /**
       * Remove values/flags/checks used for this script that
       * Contentful doesn't need.
       */

      let keysToRemove = [
        'id',
        'type'
      ]

      console.log(`!postKey: ${postKey}`)

      if (
        postKey === 'featuredImage' && postValue === 0 ||
        keysToRemove.includes(postKey)
      ) {
        delete postFields[postKey]
      }
    }
    promises.push(postFields)
  }

  console.log(promises)
  createContentfulEntries(environment, promises);

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
  // for (const [index, [key, value]] of Object.entries(Object.entries(wpData.posts))) {
  //   apiData[index].endpoint = key

  //   let objectValue = value

  //   if (key === 'content') {
  //     objectValue = formatRichTextPost(value)
  //   }

  //   if (key === 'featuredImage' && value > 0) {
  //     let assetObj = assets.filter(asset => {
  //       if (asset.fileName === wpPost.contentImages[0].link.split('/').pop()) {
  //         return asset
  //       }
  //     })[0];

  //     postFields.featuredImage = {
  //       'en-GB': {
  //         sys: {
  //           type: 'Link',
  //           linkType: 'Asset',
  //           id: assetObj.assetId
  //         }
  //       }
  //     }
  //   }

  //   postFields[key] = {
  //     'en-GB': objectValue
  //   }

    // setTimeout(function() {
    //   environment.createEntry('blogPost', {
    //     fields: postFields
    //   })
    //   .then((entry) => entry.publish())
    //   .then((entry) => {
    //     console.log(entry)
    //   })
    // }, 1000 + (3000 * index));
  // }


  // for (const [index, wpPost] of wpData.posts.entries()) {
  //   let postFields = {
  //     postTitle: {
  //       'en-GB': wpPost.postTitle
  //     },
  //     slug: {
  //       'en-GB': wpPost.slug
  //     },
  //     publishDate: {
  //       'en-GB': wpPost.publishDate
  //     },
  //     content: {
  //       'en-GB': formatRichTextPost(wpPost.content)
  //     },
  //     categories: {
  //       'en-GB': wpPost.categories
  //     },
  //     tags: {
  //       'en-GB': wpPost.tags
  //     }
  //   } 

  //   if (wpPost.featuredImage > 0) {
  //     let assetObj = assets.filter(asset => {
  //       if (asset.fileName === wpPost.contentImages[0].link.split('/').pop()) {
  //         return asset
  //       }
  //     })[0];

  //     postFields.featuredImage = {
  //       'en-GB': {
  //         sys: {
  //           type: 'Link',
  //           linkType: 'Asset',
  //           id: assetObj.assetId
  //         }
  //       }
  //     }
  //   }
  //   setTimeout(function() {
  //     environment.createEntry('blogPost', {
  //       fields: postFields
  //     })
  //     .then((entry) => entry.publish())
  //     .then((entry) => {
  //       console.log(entry)
  //     })
  //   }, 1000 + (3000 * index));
  // }
}

function createContentfulEntries(environment, promises) {
  return Promise.all(promises.map((post, index) => new Promise(async resolve => {

    let newPost
  
    setTimeout(() => {
      try {
        newPost = environment.createEntry('blogPost', {
          fields: post
        })
        .then((entry) => entry.publish())
        .then((entry) => {
          console.log(entry)
        })
      } catch (error) {
        throw(Error(error))
      }

      resolve(newPost)
    }, 1000 + (3000 * index));

  })));
}

// Ideally we'd be using Markdown here, but I like the RichText editor 🤡
function formatRichTextPost(content) {
  // TODO: split  at paragraphs, create a node for each.

  let contentor = {
    content: [
      {
        nodeType:"paragraph",
        data: {},
        content: [
          {
            value: "lorem hello world",
            nodeType:"text",
            marks: [],
            data: {}
          }
        ],
        data: {},
        nodeType: 'document'
      }
    ]
  };

  // let contentArray = content.split('<p>');

  // fields: {
  //   '<field_name>': {
  //     '<language>': {
  //       content: [
  //         {
  //           nodeType:"paragraph",
  //           data: {},
  //           content: [
  //             {
  //               value: "lorem ...",
  //               nodeType:"text",
  //               marks: [],
  //               data: {}
  //             }
  //           ]
  //         }
  //       ],
  //       data: {},
  //       nodeType: 'document'
  //     }
  //   }
  // }
  return contentor
}

migrateContent();
