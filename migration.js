const ctfClient = require('./contentful-config')

const axios = require('axios')
const fs = require('fs');

const wpEndpoint = `https://jonashcroft.co.uk/wp-json/wp/v2/`

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
  let apiPosts = getApiDataType('posts')[0];

  // Loop over our conjoined data structure and append data types to each child.
  for (const [index, [key, value]] of Object.entries(Object.entries(wpData))) {
    apiData[index].endpoint = key
  }

  console.log(`Reducing posts API data to only include fields we want`)
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
  contentfulCreateAssets()
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
    postId: mediaObj.post
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

function contentfulCreateAssets() {

}

migrateContent();
