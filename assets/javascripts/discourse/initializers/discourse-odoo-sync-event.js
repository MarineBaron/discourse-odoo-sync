import { withPluginApi } from "discourse/lib/plugin-api"

// @TODO à supprimer ou mettre en paramètres
const DISOURSE_RESTAPI_URL = "https://dev.discourse.coopaname.coop"


const updatePostWithOdooId = async (post, odooId) => {
    const rawIndex = post.raw.indexOf(']')
    const newRaw =  `${post.raw.slice(0, rawIndex)} odooId="${odooId}" ${post.raw.slice(rawIndex)}`
    return await post.update({
        raw: newRaw
    })
}

const getTopic = async (id) => {
    const url = `${DISOURSE_RESTAPI_URL}/t/${id}.json`
    const response = await fetch(url)
    if (!response.ok) {
        throw new Error(`Error on Discourse Api (${url}) : Response status ${response.status}`)
    }
    return await response.json()
}

const getPost = async (id) => {
    const url = `${DISOURSE_RESTAPI_URL}/posts/${id}.json`
    const response = await fetch(url)
    if (!response.ok) {
        throw new Error(`Error on Discourse Api (${url}) : Response status ${response.status}`)
    }
    return await response.json()
}

const getUser = async (id) => {
    const url = `${DISOURSE_RESTAPI_URL}/admin/users/${id}.json`
    const response = await fetch(url)
    if (!response.ok) {
        throw new Error(`Error on Discourse Api (${url}) : Response status ${response.status}`)
    }
    return await response.json()
}

const getPostFromTopic = async (topic) => {
    const post = topic.post_stream?.posts?.find(p => p.post_number === 1)
    if (post) {
        return await getPost(post.id)
    }
}

const calcBody = async (post, created = false) => {
    const event = post.event
    const topic = await getTopic(post.topic_id)
    const creator = await getUser(post.event.creator.id)
    const description = post.raw.replace(/\[event (?:.*?)\n\[\/event\]/, '').trim()
    const body = {
        odoo_id: event.custom_fields?.odoo_id ? parseInt(event.custom_fields?.odoo_id, 10) : null,
        discourse_id: event.id,
        published_on_discourse: true,
        created_on_discourse: created,
        name: event?.name ? event.name : topic.title,
        description: description,
        tags: topic.tags,
        creator_code: creator.user_fields[1],
        // envoyé en UTC 0 (-2:00)
        date_begin: event.starts_at.replace('.000Z', '+02:00'),
        date_end: event.ends_at.replace('.000Z', '+02:00')
      }
    return body
}

const calcBodyFromTopic = (topic, post) => {
    return {
        odoo_id: post?.event?.custom_fields?.odoo_id ? parseInt(post.event.custom_fields?.odoo_id, 10) : null,
        name: topic.title,
        tags: topic.tags,
        published_on_discourse: true
    }
}

const saveInOdoo = async (api, body) => {
    const response = await fetch(`${getOdooRestApiUrl(api)}/event/event/save`, {
        method: "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    })
    const json = await response.json()
    return json
}

const deleteInOdoo = async (api, post) => {
    const odooId = post.event.custom_fields?.odoo_id
    console.log("deleteInOdoo", post, odooId)
    if (odooId) {
        const odoo_url = `${getOdooRestApiUrl(api)}/event/event/${odooId}/delete`
        // @TODO DELETE ? 
        const odoo_response = await fetch(odoo_url)
        if (!odoo_response.ok) {
            throw new Error(`Error on Odoo Api (${url}) : Response status ${odoo_response.status}`)
        }
    }
}

const updateOdooRegistrations = async (api, odooId, invitees) => {
    console.log('updateOdooRegistrations', odooId, invitees)
    const users = await   Promise.all(invitees
      // filtre sur tous les utilisateurs allant à l'événement
      .filter((u) => u.status === "going")
      // recherche des codes des participants
      . map((i) => {
        return api.container.lookup('store:main').find('user', i.user.username)
        .then((u) =>  {
          return {
            code: u.user_fields[1],
            status: i.status
          }
        })}))
      
    console.log("participants", users)
    const odooResult = await fetch(`${getOdooRestApiUrl(api)}/event/event/${odooId}/registrations`, {
      method: "POST",
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({registrations: users})
    })
    console.log("after destroy odooRsult", odooResult)
  }

const getOdooRestApiUrl = (api) => {
    const siteSettings = api.container.lookup('site-settings:main')
    console.log("siteSettings", siteSettings)
    return siteSettings.discourse_odoo_sync_odoo_restapi_url
}

export default {
  name: "save",
  initialize() {
    withPluginApi("1.37.1", (api) => { 
        // save data in odoo after a post is created
        api.modifyClass("model:composer", (Superclass) =>
            class extends Superclass {
                async save(props) {
                    const result =  await super.save(props)
                    if (result.responseJson.action === "create_post") {
                        console.log("odoo-sync after model:composer save")
                        const post = await this.store.find("post", result.responseJson.post.id)
                        const response = await saveInOdoo(await calcBody(post, true))
                        await updatePostWithOdooId(post, response.id)
                    }
                    return result
                }
            })
        

        // save data in odoo after a post is updated
        api.modifyClass("model:post", (Superclass) =>
                class extends Superclass {
                    async afterUpdate(res) {
                        const post = res.payload
                        if (post.event) {
                            console.log("odooo-sync model:post afterUpdate", res)
                            await saveInOdoo(api, await calcBody(post))
                        }
                        return super.afterUpdate(res)
                    }
                }
            )

        
        api.modifyClass("model:topic", (Superclass) =>
            class extends Superclass {
                // update data in odoo after a topic is modified via (fastEdit)
                static async update(topic, props, opts = {}) {
                    await super.update(topic, props, opts) 
                    if (opts.fastEdit) {
                        const updatedTopic = await getTopic(topic.id)
                        const post = updatedTopic.post_stream?.posts?.find(p => p.post_number === 1)
                        if (post.event) {
                            console.log("odooo-sync model:topic update")
                            const body = calcBodyFromTopic(topic, post)
                            await saveInOdoo(api, body)
                        }
                    }
                }
                // delete data in odoo after a topic event is destroyed
                async destroy(deleted_by, opts = {}) {
                    const topic = await getTopic(this.id)
                    const post = await getPostFromTopic(topic)
                    const result =  await super.destroy(deleted_by, opts)
                    // if first post is an event, we delete it in Odoo
                    if (post?.event) {
                        console.log("odooo-sync model:topic destroy")
                        deleteInOdoo(api, post)
                    }
                    return result
                }
            })

        // save data in odoo after a post is updated
        api.modifyClass("model:discourse-post-event-invitee", (Superclass) =>
            class extends Superclass {
                async destroyRecord() {
                    console.log("model:discourse-post-event-invitee destroy")
                    const result =  await this.store.destroyRecord(this.__type, this)
                    const post = await this.store.find("post", this.post_id)
                    const invitees = await this.store.findAll(
                        this.__type,
                        {
                          post_id: this.post_id,
                        }
                      )
                    await updateOdooRegistrations(api, post.event.custom_fields.odoo_id, invitees.content)
                    return result
                }
            }
        )
    });
  },
};
