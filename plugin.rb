# name: discourse-odoo-sync
# about: Synchronisation between Discourse and Odoo
# version: 0.1
# authors: Marine Monnier-Baron
# url: https://gitlab.com/coopaname/discourse-odoo-sync

module ::DiscourseOdooSync
    PLUGIN_NAME = "discourse-odoo-sync"
  end

require_relative "lib/discourse_odoo_sync/engine"

after_initialize do

  end