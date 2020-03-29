const contentful = require('contentful-management')
const axios = require('axios')
const fs = require('fs');

const wpEndpoint = `https://jonashcroft.co.uk/wp-json/wp/v2/`

const ctfData = {
  accessToken: '[ACCESS_TOKEN]',
  environment: '[ENVIRONMENT_ID]',
  spaceId: '[SPACE_ID]'
}

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
  // Loop over posts
  for (let [key, postData] of Object.entries(apiPosts.data)) {
    console.log(`----`)
    console.log(`Processing ${postData.slug}`)
    // Create base object with only limited keys (e.g. just 'slug', 'categories', 'title') etc.
    let fieldData = {
      id: postData.id,
      type: postData.type,
      postTitle: postData.title.rendered,
      slug: postData.slug,
      content: postData.content.rendered,
      publishedAt: postData.date_gmt + '+00:00',
      featuredImage: getPostFeaturedMedia(postData.featured_media),
      tags: getPostLabels(postData.tags, 'tags'),
      categories: getPostLabels(postData.categories, 'categories'),
      contentImages: getPostBodyImages(postData)
    }

    wpData.posts.push(fieldData)
  }

  console.log(`...Done!`)
  writeDataToFile()
  createForContentful()
}

function getPostFeaturedMedia(postMedia) {
  console.log(`- Getting Featured Image`)
  let featuredMedia = {}

  if (postMedia === 0) {
    return featuredMedia
  }

  let mediaData = getApiDataType(`media`)[0];

  let mediaObj = mediaData.data.filter(obj => {
    if (obj.id === postMedia) {
      return obj
    }
  })[0];

  featuredMedia = {
    link: mediaObj.source_url,
    description: mediaObj.alt_text,
    title:  mediaObj.alt_text,
    postId: mediaObj.post,
    mediaId: postMedia
  }

  return featuredMedia
}

function getPostBodyImages(postData) {
  console.log(`- Getting content images`)
  let imageRegex = /<img\s[^>]*?src\s*=\s*['\"]([^'\"]*?)['\"][^>]*?>/g
  let bodyImages = []

  // console.log(imageRegex.exec(postData.content.rendered))
  while (foundImage = imageRegex.exec(postData.content.rendered)) {
    let alt = foundImage[0].split('alt="')[1].split('"')[0]

    bodyImages.push({
      link: foundImage[1],
      description: alt,
      title: alt,
      postId: postData.id
    })
  }
  return bodyImages
}

function getPostLabels(postItems, labelType) {
  console.log(`- Getting post ${labelType}`)
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

function writeDataToFile() {
  console.log(`Writing data to a file`)

  fs.writeFile(`./posts.json`, JSON.stringify(wpData, null, 2), (err) => {
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

    createContentfulAssets(environment)

    for (const wpPost of wpData.posts) {
      // console.log(wpPost.slug)
    }

    // environment.createEntry('blogPost', {
    //   fields: {
    //     postTitle: {
    //       'en-US': 'this is my post title'
    //     },
    //     slug: {
    //       'en-US': 'this-is-the-post-slug'
    //     },
    //   }
    // })
  })
  .catch((error) => {
    console.log(error.details.errors.message)
    return error
  })
}

createContentfulAssets(environment) {

  const postLength = wpData.posts.length

  // Create the assets FIRST so that we can attach them to posts later.
  for (const wpPost of wpData.posts) {
    for (const [index, contentImage] of wpPost.contentImages.entries()) {
      console.log(index)
      // Rate limiting will occur, there is ABSOLUTLY a better way to do this.
      setTimeout(() => {
        // console.log(`Creating asset ${contentImage.link}`)
        // environment.createAsset({
        //   fields: {
        //     title: {
        //       'en-GB': contentImage.title
        //     },
        //     description: {
        //       'en-GB': contentImage.description
        //     },
        //     file: {
        //       'en-GB': {
        //         contentType: 'image/jpeg',
        //         fileName: `${contentImage.title.toLowerCase().replace(/\s/g, '-')}.jpg`,
        //         upload: encodeURI(contentImage.link)
        //       }
        //     }
        //   }
        // })
      }, 5000)
    }
  }
}

migrateContent();
