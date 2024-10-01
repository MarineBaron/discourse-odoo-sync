module ::OdooSync
    class InviteesController < ::ApplicationController
      requires_plugin PLUGIN_NAME
      
      # get post (identified by post_id) 's invitees
      def index
        params.require(:post_id)
        invitees = get_event_invitees(params[:post_id])
        render json: invitees
      end


      # create an invitee (identified by code) on post (identified by post_id)
      def create
        params.require(:post_id)
        params.require(:code)
        event = DiscoursePostEvent::Event.find(params[:post_id])
        guardian.ensure_can_see!(event.post)
  
        raise Discourse::InvalidAccess if !event.can_user_update_attendance(current_user)

        user_id = get_user_id_by_code(params[:code])
        invitee =
          DiscoursePostEvent::Invitee.create_attendance!(user_id, params[:post_id], "going")

        render json: DiscoursePostEvent::InviteeSerializer.new(invitee)
      end

      private
      def get_user_id_by_code(code)
        sql = <<~SQL
          SELECT u.id
          FROM users AS u
          JOIN user_custom_fields usf ON usf.user_id=u.id AND  usf.name='user_field_1'
          WHERE usf.value=:code
          LIMIT 1
        SQL
        users = DB.query(
          sql,
          code: code
          )
        
        if users.count == 0
          return
        end
        
        return users.first.id
      end

      def get_event_invitees(post_id)
        sql = <<~SQL
          SELECT i.id, i.status, u.username, ucf.value AS code
          FROM discourse_post_event_invitees AS i
          JOIN users AS u ON u.id=i.user_id
          JOIN user_custom_fields AS ucf ON u.id=ucf.user_id AND  ucf.name='user_field_1'
          WHERE i.post_id=:post_id
          LIMIT 1
        SQL
      invitees = DB.query(
          sql,
          post_id: post_id
        )
        
        return invitees
      end
    end
  end
