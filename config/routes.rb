# frozen_string_literal: true

DiscourseOdooSync::Engine.routes.draw do
    get "/events/:post_id/invitees" => "invitees#index"
    post "/events/:post_id/invitees" => "invitees#create"
  end
  
  Discourse::Application.routes.draw { mount ::DiscourseOdooSync::Engine, at: "discourse-odoo-sync" }