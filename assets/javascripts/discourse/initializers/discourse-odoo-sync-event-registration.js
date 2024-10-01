import { withPluginApi } from 'discourse/lib/plugin-api'

const ODOO_RESTAPI_URL = "http://localhost:8069/rest_api/discourse"

const updateOdooRegistrations = async (api, odooId, invitees, status) => {
  const currentUser = await api.container.lookup('store:main').find('user', api.getCurrentUser().username)
  const users = await   Promise.all(invitees
    // filtre sur tous les utilisateurs allant à l'événement (sauf le courant)
    .filter((u) => u.id !== currentUser.id && u.status === 'going')
    // recherche des codes des participants
    . map((i) => {
      return api.container.lookup('store:main').find('user', i.user.username)
      .then((u) =>  {
        return {
          code: u.user_fields[1],
          status: i.status
        }
      })}))
    
    // ajout du current user
   if (status === 'going') {
      users.push({
        code: currentUser.user_fields[1],
        status: status
      })
    }
  console.log("participants", users)
  const odooResult = await fetch(`${ODOO_RESTAPI_URL}/event/event/${odooId}/registrations`, {
    method: "POST",
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({registrations: users})
  })
  console.log("after changeWatchingInviteeStatus odooRsult", odooResult)
}

export default {
    name: 'odoo-sync',
    initialize() {
        withPluginApi("1.37.1", api => {
            api.reopenWidget("discourse-post-event", {
              async changeWatchingInviteeStatus(status) {
                if (this.state.eventModel.watching_invitee) {
                  const currentStatus = this.state.eventModel.watching_invitee.status;
                  let newStatus = status;
                  if (status === currentStatus && status === "interested") {
                    newStatus = null;
                  }
                  this.store.update(
                    "discourse-post-event-invitee",
                    this.state.eventModel.watching_invitee.id,
                    { status: newStatus, post_id: this.state.eventModel.id }
                  );
            
                  this.appEvents.trigger("calendar:update-invitee-status", {
                    status: newStatus,
                    postId: this.state.eventModel.id,
                  });
                } else {
                  this.store
                    .createRecord("discourse-post-event-invitee")
                    .save({ post_id: this.state.eventModel.id, status });
                  this.appEvents.trigger("calendar:create-invitee-status", {
                    status,
                    postId: this.state.eventModel.id,
                  });
                }
                /*    Mise à jour de Odoo   */
                await updateOdooRegistrations(
                    api,
                    this.state.eventModel.custom_fields.odoo_id,
                    this.state.eventModel.sample_invitees,
                    status
                  )
                /*  ---  */
              },
            })
        });
    }
}